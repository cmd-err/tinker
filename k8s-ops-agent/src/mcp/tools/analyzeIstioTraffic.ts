/**
 * Analyze Istio Traffic Tool
 * Analyzes Istio VirtualServices and DestinationRules for misconfigurations and traffic patterns
 */

import { z } from "zod";
import {
  type K8sOpsTool,
  type ToolResult,
  type ToolExecutionContext,
  type ClusterSnapshot,
  type IstioTrafficAnalysisResult,
  type IstioTopologyIssue,
  type IstioTopology,
  type TrafficGraphNode,
  type TrafficGraphEdge,
  type VirtualServiceInfo,
  type DestinationRuleInfo,
  type GatewayInfo,
  type IstioRouteDestination,
  type GatewayServer,
} from "../../types.js";

// Input schema for the tool
export const AnalyzeIstioTrafficInputSchema = z.object({
  snapshot: z
    .custom<ClusterSnapshot>()
    .describe("The cluster snapshot to analyze (must include Istio resources)"),
  options: z
    .object({
      includeTopology: z
        .boolean()
        .default(true)
        .describe("Whether to generate a traffic topology graph"),
      checkMTLS: z
        .boolean()
        .default(true)
        .describe("Whether to check for mTLS consistency"),
    })
    .default({})
    .describe("Analysis options"),
});

export type AnalyzeIstioTrafficInput = z.infer<typeof AnalyzeIstioTrafficInputSchema>;

/**
 * Generate unique ID for issues
 */
function generateIssueId(type: string, ...parts: string[]): string {
  return `${type}-${parts.join("-")}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * Extract all referenced subsets from VirtualServices
 */
function extractReferencedSubsets(
  virtualServices: VirtualServiceInfo[]
): Map<string, Set<string>> {
  const hostSubsets = new Map<string, Set<string>>();

  for (const vs of virtualServices) {
    // Process HTTP routes
    for (const httpRoute of vs.http ?? []) {
      for (const route of httpRoute.route ?? []) {
        if (route.host && route.subset) {
          const subsets = hostSubsets.get(route.host) ?? new Set();
          subsets.add(route.subset);
          hostSubsets.set(route.host, subsets);
        }
      }

      // Process mirror destinations
      if (httpRoute.mirror?.host && httpRoute.mirror?.subset) {
        const subsets = hostSubsets.get(httpRoute.mirror.host) ?? new Set();
        subsets.add(httpRoute.mirror.subset);
        hostSubsets.set(httpRoute.mirror.host, subsets);
      }
    }

    // Process TCP routes
    for (const tcpRoute of vs.tcp ?? []) {
      for (const route of tcpRoute.route ?? []) {
        if (route.host && route.subset) {
          const subsets = hostSubsets.get(route.host) ?? new Set();
          subsets.add(route.subset);
          hostSubsets.set(route.host, subsets);
        }
      }
    }
  }

  return hostSubsets;
}

/**
 * Extract all defined subsets from DestinationRules
 */
function extractDefinedSubsets(
  destinationRules: DestinationRuleInfo[]
): Map<string, Set<string>> {
  const hostSubsets = new Map<string, Set<string>>();

  for (const dr of destinationRules) {
    const subsets = new Set<string>();
    for (const subset of dr.subsets ?? []) {
      subsets.add(subset.name);
    }
    if (subsets.size > 0) {
      hostSubsets.set(dr.host, subsets);
    }
  }

  return hostSubsets;
}

/**
 * Detect unused subsets (defined in DR but never referenced)
 */
function detectUnusedSubsets(
  definedSubsets: Map<string, Set<string>>,
  referencedSubsets: Map<string, Set<string>>,
  destinationRules: DestinationRuleInfo[]
): IstioTopologyIssue[] {
  const issues: IstioTopologyIssue[] = [];

  for (const [host, defined] of definedSubsets) {
    const referenced = referencedSubsets.get(host) ?? new Set();
    const unused = [...defined].filter((s) => !referenced.has(s));

    if (unused.length > 0) {
      const dr = destinationRules.find((d) => d.host === host);

      issues.push({
        id: generateIssueId("unused-subset", host, unused.join("-")),
        type: "unused-subset",
        severity: "low",
        description: `DestinationRule for host "${host}" defines subset(s) that are never referenced in any VirtualService: ${unused.join(", ")}`,
        relatedResources: dr
          ? [{ kind: "DestinationRule", name: dr.name, namespace: dr.namespace }]
          : [],
        suggestedFix:
          "Remove unused subsets from the DestinationRule, or add routes that use these subsets in VirtualServices.",
      });
    }
  }

  return issues;
}

/**
 * Detect missing subsets (referenced in VS but not defined in DR)
 */
function detectMissingSubsets(
  definedSubsets: Map<string, Set<string>>,
  referencedSubsets: Map<string, Set<string>>,
  virtualServices: VirtualServiceInfo[]
): IstioTopologyIssue[] {
  const issues: IstioTopologyIssue[] = [];

  for (const [host, referenced] of referencedSubsets) {
    const defined = definedSubsets.get(host) ?? new Set();
    const missing = [...referenced].filter((s) => !defined.has(s));

    if (missing.length > 0) {
      // Find VirtualServices that reference these missing subsets
      const relatedVS = virtualServices.filter((vs) => {
        const vsRefs = new Set<string>();
        for (const httpRoute of vs.http ?? []) {
          for (const route of httpRoute.route ?? []) {
            if (route.host === host && route.subset) {
              vsRefs.add(route.subset);
            }
          }
        }
        return [...vsRefs].some((s) => missing.includes(s));
      });

      issues.push({
        id: generateIssueId("missing-subset", host, missing.join("-")),
        type: "missing-subset",
        severity: "high",
        description: `VirtualService(s) reference subset(s) for host "${host}" that are not defined in any DestinationRule: ${missing.join(", ")}. Traffic to these subsets will fail.`,
        relatedResources: relatedVS.map((vs) => ({
          kind: "VirtualService",
          name: vs.name,
          namespace: vs.namespace,
        })),
        suggestedFix: `Create a DestinationRule for host "${host}" with the missing subset(s), or update VirtualServices to use existing subsets.`,
      });
    }
  }

  return issues;
}

/**
 * Detect orphan VirtualServices (pointing to non-existent services)
 */
function detectOrphanVirtualServices(
  virtualServices: VirtualServiceInfo[],
  _destinationRules: DestinationRuleInfo[]
): IstioTopologyIssue[] {
  const issues: IstioTopologyIssue[] = [];

  for (const vs of virtualServices) {
    // Check if VS has routes but no valid destinations
    const hasRoutes =
      (vs.http?.length ?? 0) > 0 || (vs.tcp?.length ?? 0) > 0;

    if (!hasRoutes) {
      issues.push({
        id: generateIssueId("orphan-virtual-service", vs.namespace, vs.name),
        type: "orphan-virtual-service",
        severity: "low",
        description: `VirtualService "${vs.namespace}/${vs.name}" has no HTTP or TCP routes defined`,
        relatedResources: [
          { kind: "VirtualService", name: vs.name, namespace: vs.namespace },
        ],
        suggestedFix:
          "Add routes to the VirtualService or remove it if no longer needed.",
      });
    }

    // Check for VirtualServices with empty hosts
    if (vs.hosts.length === 0) {
      issues.push({
        id: generateIssueId("orphan-virtual-service", vs.namespace, vs.name, "no-hosts"),
        type: "orphan-virtual-service",
        severity: "medium",
        description: `VirtualService "${vs.namespace}/${vs.name}" has no hosts defined`,
        relatedResources: [
          { kind: "VirtualService", name: vs.name, namespace: vs.namespace },
        ],
        suggestedFix: "Define hosts for the VirtualService or remove it if no longer needed.",
      });
    }
  }

  return issues;
}

/**
 * Detect orphan DestinationRules (no corresponding VirtualService routes)
 */
function detectOrphanDestinationRules(
  destinationRules: DestinationRuleInfo[],
  virtualServices: VirtualServiceInfo[]
): IstioTopologyIssue[] {
  const issues: IstioTopologyIssue[] = [];

  // Collect all hosts referenced in VirtualServices
  const referencedHosts = new Set<string>();
  for (const vs of virtualServices) {
    for (const httpRoute of vs.http ?? []) {
      for (const route of httpRoute.route ?? []) {
        if (route.host) {
          referencedHosts.add(route.host);
        }
      }
      if (httpRoute.mirror?.host) {
        referencedHosts.add(httpRoute.mirror.host);
      }
    }
    for (const tcpRoute of vs.tcp ?? []) {
      for (const route of tcpRoute.route ?? []) {
        if (route.host) {
          referencedHosts.add(route.host);
        }
      }
    }
  }

  for (const dr of destinationRules) {
    if (!referencedHosts.has(dr.host)) {
      issues.push({
        id: generateIssueId("orphan-destination-rule", dr.namespace, dr.name),
        type: "orphan-destination-rule",
        severity: "low",
        description: `DestinationRule "${dr.namespace}/${dr.name}" for host "${dr.host}" is not referenced by any VirtualService routes`,
        relatedResources: [
          { kind: "DestinationRule", name: dr.name, namespace: dr.namespace },
        ],
        suggestedFix:
          "Add VirtualService routes that use this DestinationRule, or remove it if no longer needed.",
      });
    }
  }

  return issues;
}

/**
 * Detect stale mirror routes
 */
function detectStaleMirrors(
  virtualServices: VirtualServiceInfo[]
): IstioTopologyIssue[] {
  const issues: IstioTopologyIssue[] = [];

  for (const vs of virtualServices) {
    for (const httpRoute of vs.http ?? []) {
      if (httpRoute.mirror) {
        issues.push({
          id: generateIssueId(
            "stale-mirror",
            vs.namespace,
            vs.name,
            httpRoute.mirror.host
          ),
          type: "stale-mirror",
          severity: "low",
          description: `VirtualService "${vs.namespace}/${vs.name}" has an active mirror route to "${httpRoute.mirror.host}${httpRoute.mirror.subset ? `:${httpRoute.mirror.subset}` : ""}". Mirror routes are often used for testing and may have been left enabled.`,
          relatedResources: [
            { kind: "VirtualService", name: vs.name, namespace: vs.namespace },
          ],
          suggestedFix:
            "Review if the mirror route is still needed. If it was used for testing, consider removing it to reduce unnecessary traffic duplication.",
        });
      }
    }
  }

  return issues;
}

/**
 * Detect inconsistent mTLS configurations
 */
function detectInconsistentMTLS(
  destinationRules: DestinationRuleInfo[]
): IstioTopologyIssue[] {
  const issues: IstioTopologyIssue[] = [];

  // Group DRs by namespace
  const drByNamespace = new Map<string, DestinationRuleInfo[]>();
  for (const dr of destinationRules) {
    const existing = drByNamespace.get(dr.namespace) ?? [];
    existing.push(dr);
    drByNamespace.set(dr.namespace, existing);
  }

  for (const [namespace, drs] of drByNamespace) {
    const tlsModes = new Map<string, DestinationRuleInfo[]>();

    for (const dr of drs) {
      const mode = dr.trafficPolicy?.tls?.mode ?? "UNSET";
      const existing = tlsModes.get(mode) ?? [];
      existing.push(dr);
      tlsModes.set(mode, existing);
    }

    // If there are multiple different TLS modes in the same namespace
    if (tlsModes.size > 1) {
      const modes = [...tlsModes.keys()].join(", ");
      issues.push({
        id: generateIssueId("inconsistent-mtls", namespace),
        type: "inconsistent-mtls",
        severity: "medium",
        description: `Namespace "${namespace}" has DestinationRules with inconsistent mTLS configurations: ${modes}. This may cause unexpected behavior.`,
        relatedResources: drs.map((dr) => ({
          kind: "DestinationRule",
          name: dr.name,
          namespace: dr.namespace,
        })),
        suggestedFix:
          "Standardize mTLS mode across DestinationRules in the same namespace, or ensure the differences are intentional.",
      });
    }
  }

  return issues;
}

/**
 * Detect misconfigured routes (e.g., weights don't sum to 100)
 */
function detectMisconfiguredRoutes(
  virtualServices: VirtualServiceInfo[]
): IstioTopologyIssue[] {
  const issues: IstioTopologyIssue[] = [];

  for (const vs of virtualServices) {
    for (let i = 0; i < (vs.http?.length ?? 0); i++) {
      const httpRoute = vs.http?.[i];
      if (!httpRoute?.route || httpRoute.route.length === 0) continue;

      // Check if weights are used and sum to 100
      const routesWithWeights = httpRoute.route.filter(
        (r: IstioRouteDestination) => r.weight !== undefined
      );

      if (routesWithWeights.length > 0) {
        const totalWeight = routesWithWeights.reduce(
          (sum: number, r: IstioRouteDestination) => sum + (r.weight ?? 0),
          0
        );

        if (totalWeight !== 100) {
          issues.push({
            id: generateIssueId(
              "misconfigured-route",
              vs.namespace,
              vs.name,
              `route-${i}`
            ),
            type: "misconfigured-route",
            severity: "medium",
            description: `VirtualService "${vs.namespace}/${vs.name}" has a route where weights sum to ${totalWeight} instead of 100`,
            relatedResources: [
              { kind: "VirtualService", name: vs.name, namespace: vs.namespace },
            ],
            suggestedFix: "Ensure route weights sum to 100 for proper traffic distribution.",
          });
        }
      }

      // Check for routes with multiple destinations but no weights
      if (httpRoute.route.length > 1 && routesWithWeights.length === 0) {
        issues.push({
          id: generateIssueId(
            "misconfigured-route",
            vs.namespace,
            vs.name,
            `route-${i}`,
            "no-weights"
          ),
          type: "misconfigured-route",
          severity: "low",
          description: `VirtualService "${vs.namespace}/${vs.name}" has a route with multiple destinations but no weights specified. Istio will use round-robin.`,
          relatedResources: [
            { kind: "VirtualService", name: vs.name, namespace: vs.namespace },
          ],
          suggestedFix:
            "Consider adding explicit weights for clearer traffic distribution intent.",
        });
      }
    }
  }

  return issues;
}

/**
 * Build traffic topology graph
 */
function buildTopology(
  virtualServices: VirtualServiceInfo[],
  gateways: GatewayInfo[]
): IstioTopology {
  const nodes: TrafficGraphNode[] = [];
  const edges: TrafficGraphEdge[] = [];
  const nodeIds = new Set<string>();
  let edgeCounter = 0;

  // Add gateway nodes
  for (const gw of gateways) {
    const nodeId = `gateway-${gw.namespace}-${gw.name}`;
    if (!nodeIds.has(nodeId)) {
      nodes.push({
        id: nodeId,
        type: "gateway",
        name: gw.name,
        namespace: gw.namespace,
        metadata: {
          hosts: gw.servers.flatMap((s: GatewayServer) => s.hosts),
        },
      });
      nodeIds.add(nodeId);
    }
  }

  // Process VirtualServices
  for (const vs of virtualServices) {
    // Add service nodes for hosts
    for (const host of vs.hosts) {
      const nodeId = `service-${host}`;
      if (!nodeIds.has(nodeId)) {
        nodes.push({
          id: nodeId,
          type: host.includes("*") ? "external" : "service",
          name: host,
          namespace: vs.namespace,
        });
        nodeIds.add(nodeId);
      }
    }

    // Add edges from gateways to hosts
    for (const gwName of vs.gateways ?? []) {
      const gwNode = nodes.find(
        (n) =>
          n.type === "gateway" &&
          (n.name === gwName || `${n.namespace}/${n.name}` === gwName)
      );

      if (gwNode) {
        for (const host of vs.hosts) {
          const targetId = `service-${host}`;
          edges.push({
            id: `edge-${edgeCounter++}`,
            source: gwNode.id,
            target: targetId,
          });
        }
      }
    }

    // Add edges for HTTP routes
    for (const httpRoute of vs.http ?? []) {
      for (const host of vs.hosts) {
        const sourceId = `service-${host}`;

        for (const route of httpRoute.route ?? []) {
          if (route.host) {
            const targetId = `service-${route.host}`;

            // Add target service node if not exists
            if (!nodeIds.has(targetId)) {
              nodes.push({
                id: targetId,
                type: "service",
                name: route.host,
                namespace: vs.namespace,
              });
              nodeIds.add(targetId);
            }

            edges.push({
              id: `edge-${edgeCounter++}`,
              source: sourceId,
              target: targetId,
              weight: route.weight,
              subset: route.subset,
            });
          }
        }

        // Add mirror edges
        if (httpRoute.mirror?.host) {
          const mirrorTargetId = `service-${httpRoute.mirror.host}`;

          if (!nodeIds.has(mirrorTargetId)) {
            nodes.push({
              id: mirrorTargetId,
              type: "service",
              name: httpRoute.mirror.host,
              namespace: vs.namespace,
            });
            nodeIds.add(mirrorTargetId);
          }

          edges.push({
            id: `edge-${edgeCounter++}`,
            source: sourceId,
            target: mirrorTargetId,
            isMirror: true,
            subset: httpRoute.mirror.subset,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Execute the analyze-istio-traffic tool
 */
async function executeAnalyzeIstioTraffic(
  input: AnalyzeIstioTrafficInput,
  _context: ToolExecutionContext
): Promise<ToolResult<IstioTrafficAnalysisResult>> {
  const startTime = Date.now();

  try {
    const { snapshot, options } = input;
    const issues: IstioTopologyIssue[] = [];

    // Check if Istio data is available
    if (!snapshot.istio) {
      return {
        success: true,
        data: {
          summary:
            "No Istio resources found in the cluster snapshot. Enable includeIstio when fetching the snapshot to analyze Istio traffic.",
          issueCount: 0,
          issues: [],
          analyzedAt: new Date().toISOString(),
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const { virtualServices, destinationRules, gateways } = snapshot.istio;

    // Extract subsets information
    const definedSubsets = extractDefinedSubsets(destinationRules);
    const referencedSubsets = extractReferencedSubsets(virtualServices);

    // Detect unused subsets
    issues.push(
      ...detectUnusedSubsets(definedSubsets, referencedSubsets, destinationRules)
    );

    // Detect missing subsets
    issues.push(
      ...detectMissingSubsets(definedSubsets, referencedSubsets, virtualServices)
    );

    // Detect orphan VirtualServices
    issues.push(
      ...detectOrphanVirtualServices(virtualServices, destinationRules)
    );

    // Detect orphan DestinationRules
    issues.push(...detectOrphanDestinationRules(destinationRules, virtualServices));

    // Detect stale mirrors
    issues.push(...detectStaleMirrors(virtualServices));

    // Detect inconsistent mTLS
    if (options?.checkMTLS !== false) {
      issues.push(...detectInconsistentMTLS(destinationRules));
    }

    // Detect misconfigured routes
    issues.push(...detectMisconfiguredRoutes(virtualServices));

    // Build topology if requested
    let topology: IstioTopology | undefined;
    if (options?.includeTopology !== false) {
      topology = buildTopology(virtualServices, gateways);
    }

    // Generate summary
    const highSeverity = issues.filter((i) => i.severity === "high").length;
    const mediumSeverity = issues.filter((i) => i.severity === "medium").length;
    const lowSeverity = issues.filter((i) => i.severity === "low").length;

    let summary = `Analyzed ${virtualServices.length} VirtualServices, ${destinationRules.length} DestinationRules, and ${gateways.length} Gateways. `;

    if (issues.length > 0) {
      summary += `Found ${issues.length} issues: ${highSeverity} high, ${mediumSeverity} medium, ${lowSeverity} low severity.`;
    } else {
      summary += "No issues found. Istio configuration appears healthy.";
    }

    const result: IstioTrafficAnalysisResult = {
      summary,
      issueCount: issues.length,
      issues,
      topology,
      analyzedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data: result,
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "ISTIO_ANALYSIS_FAILED",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Analyze Istio Traffic Tool definition
 */
export const analyzeIstioTrafficTool: K8sOpsTool<
  AnalyzeIstioTrafficInput,
  IstioTrafficAnalysisResult
> = {
  id: "analyze-istio-traffic",
  title: "Analyze Istio Traffic",
  description:
    "Analyzes Istio VirtualServices, DestinationRules, and Gateways for misconfigurations, unused subsets, orphan resources, stale mirror routes, and mTLS inconsistencies. Optionally generates a traffic topology graph.",
  inputSchema: AnalyzeIstioTrafficInputSchema,
  execute: executeAnalyzeIstioTraffic,
};
