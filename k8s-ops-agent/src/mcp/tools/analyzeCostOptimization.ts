/**
 * Analyze Cost Optimization Tool
 * Analyzes cluster resources for cost optimization opportunities
 */

import { z } from "zod";
import {
  type K8sOpsTool,
  type ToolResult,
  type ToolExecutionContext,
  type ClusterSnapshot,
  type CostAnalysisResult,
  type CostRecommendation,
  type NodeInfo,
  type WorkloadInfo,
  type PodInfo,
  type NamespaceSummary,
} from "../../types.js";

// Input schema for the tool
export const AnalyzeCostOptimizationInputSchema = z
  .object({
    snapshotId: z
      .string()
      .optional()
      .describe("ID of a previously fetched cluster snapshot (from get-cluster-snapshot)"),
    snapshot: z
      .custom<ClusterSnapshot>()
      .optional()
      .describe("The cluster snapshot to analyze (alternative to snapshotId)"),
    thresholds: z
      .object({
        nodeUtilizationLow: z
          .number()
          .min(0)
          .max(1)
          .default(0.3)
          .describe("Node utilization below this is considered underutilized"),
        workloadOverprovisionRatio: z
          .number()
          .min(1)
          .default(2)
          .describe("Request/usage ratio above this is considered overprovisioned"),
        idlePodThresholdHours: z
          .number()
          .min(0)
          .default(24)
          .describe("Pods with no activity for this many hours are flagged"),
      })
      .default({})
      .describe("Thresholds for cost analysis"),
    pricingConfig: z
      .object({
        cpuCoreHourCost: z
          .number()
          .default(0.05)
          .describe("Cost per CPU core-hour in USD"),
        memoryGiBHourCost: z
          .number()
          .default(0.01)
          .describe("Cost per GiB-hour in USD"),
      })
      .optional()
      .describe("Optional pricing configuration for cost estimates"),
  })
  .refine((data) => data.snapshotId || data.snapshot, {
    message: "Must provide either snapshotId or snapshot",
  });

export type AnalyzeCostOptimizationInput = z.infer<typeof AnalyzeCostOptimizationInputSchema>;

/**
 * Default resource estimates when actual values are unavailable
 */
const DEFAULT_POD_CPU_MILLICORES = 100; // 100m default assumption
const DEFAULT_POD_MEMORY_BYTES = 128 * 1024 * 1024; // 128Mi default assumption

/**
 * Parse CPU string to millicores
 */
function parseCPU(cpu: string | undefined): number {
  if (!cpu) return 0;
  const value = cpu.toLowerCase();
  if (value.endsWith("m")) {
    return parseInt(value.slice(0, -1), 10);
  }
  return parseInt(value, 10) * 1000;
}

/**
 * Parse memory string to bytes
 */
function parseMemory(memory: string | undefined): number {
  if (!memory) return 0;
  const value = memory.toLowerCase();
  const units: Record<string, number> = {
    ki: 1024,
    mi: 1024 ** 2,
    gi: 1024 ** 3,
    ti: 1024 ** 4,
    k: 1000,
    m: 1000 ** 2,
    g: 1000 ** 3,
    t: 1000 ** 4,
  };

  for (const [unit, multiplier] of Object.entries(units)) {
    if (value.endsWith(unit)) {
      return parseInt(value.slice(0, -unit.length), 10) * multiplier;
    }
  }
  return parseInt(value, 10);
}

/**
 * Generate unique ID for recommendations
 */
function generateId(type: string, kind: string, name: string, namespace?: string): string {
  return `${type}-${kind}-${namespace ? `${namespace}-` : ""}${name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/**
 * Analyze node utilization
 */
function analyzeNodeUtilization(
  nodes: NodeInfo[],
  pods: PodInfo[],
  workloads: WorkloadInfo[],
  thresholdLow: number
): CostRecommendation[] {
  const recommendations: CostRecommendation[] = [];

  // Create a map of node -> pods
  const nodePodMap = new Map<string, PodInfo[]>();
  for (const pod of pods) {
    if (pod.nodeName) {
      const existing = nodePodMap.get(pod.nodeName) ?? [];
      existing.push(pod);
      nodePodMap.set(pod.nodeName, existing);
    }
  }

  // Calculate workload requests per namespace/name for pod lookup
  const workloadRequests = new Map<string, { cpu: number; memory: number }>();
  for (const workload of workloads) {
    let totalCPU = 0;
    let totalMemory = 0;
    for (const container of workload.containers) {
      totalCPU += parseCPU(container.requests?.cpu);
      totalMemory += parseMemory(container.requests?.memory);
    }
    workloadRequests.set(`${workload.namespace}/${workload.name}`, {
      cpu: totalCPU,
      memory: totalMemory,
    });
  }

  for (const node of nodes) {
    const nodePods = nodePodMap.get(node.name) ?? [];
    const runningPods = nodePods.filter((p) => p.phase === "Running");

    // Sum up resource requests from running pods
    let totalRequestedCPU = 0;
    let totalRequestedMemory = 0;

    for (const pod of runningPods) {
      // Try to get requests from workload if available
      const ownerKey = pod.ownerRef
        ? `${pod.namespace}/${pod.ownerRef.name}`
        : null;
      const workloadReq = ownerKey ? workloadRequests.get(ownerKey) : null;

      if (workloadReq) {
        totalRequestedCPU += workloadReq.cpu;
        totalRequestedMemory += workloadReq.memory;
      } else {
        // Estimate from pod (basic assumption)
        totalRequestedCPU += DEFAULT_POD_CPU_MILLICORES;
        totalRequestedMemory += DEFAULT_POD_MEMORY_BYTES;
      }
    }

    const nodeCapacityCPU = parseCPU(node.allocatable.cpu);
    const nodeCapacityMemory = parseMemory(node.allocatable.memory);

    const cpuUtilization = nodeCapacityCPU > 0 ? totalRequestedCPU / nodeCapacityCPU : 0;
    const memoryUtilization =
      nodeCapacityMemory > 0 ? totalRequestedMemory / nodeCapacityMemory : 0;

    const avgUtilization = (cpuUtilization + memoryUtilization) / 2;

    if (avgUtilization < thresholdLow) {
      const unusedCPUCores = (nodeCapacityCPU - totalRequestedCPU) / 1000;
      const unusedMemoryGiB = (nodeCapacityMemory - totalRequestedMemory) / (1024 ** 3);

      recommendations.push({
        id: generateId("underutilized-node", "Node", node.name),
        type: "underutilized-node",
        severity: avgUtilization < thresholdLow / 2 ? "high" : "medium",
        targetRef: {
          kind: "Node",
          name: node.name,
        },
        description: `Node ${node.name} is underutilized with only ${(avgUtilization * 100).toFixed(1)}% average resource utilization (CPU: ${(cpuUtilization * 100).toFixed(1)}%, Memory: ${(memoryUtilization * 100).toFixed(1)}%)`,
        potentialSavings: {
          cpuCoreHours: unusedCPUCores * 24, // per day
          memoryGiBHours: unusedMemoryGiB * 24,
        },
        suggestedAction:
          runningPods.length === 0
            ? "Consider draining and removing this node as it has no running pods"
            : "Consider consolidating workloads to fewer nodes or using cluster autoscaler",
      });
    }
  }

  return recommendations;
}

/**
 * Analyze workload overprovisioning
 */
function analyzeWorkloadOverprovisioning(
  workloads: WorkloadInfo[],
  thresholdRatio: number
): CostRecommendation[] {
  const recommendations: CostRecommendation[] = [];

  for (const workload of workloads) {
    let hasOverprovisioning = false;
    const overProvisionedContainers: string[] = [];

    for (const container of workload.containers) {
      const requestCPU = parseCPU(container.requests?.cpu);
      const limitCPU = parseCPU(container.limits?.cpu);
      const requestMemory = parseMemory(container.requests?.memory);
      const limitMemory = parseMemory(container.limits?.memory);

      // Check if limits are significantly higher than requests (suggests overprovisioning)
      if (limitCPU > 0 && requestCPU > 0 && limitCPU / requestCPU > thresholdRatio) {
        hasOverprovisioning = true;
        overProvisionedContainers.push(`${container.name} (CPU)`);
      }

      if (limitMemory > 0 && requestMemory > 0 && limitMemory / requestMemory > thresholdRatio) {
        hasOverprovisioning = true;
        overProvisionedContainers.push(`${container.name} (Memory)`);
      }

      // Also flag very high absolute requests with low replica count
      if (requestCPU > 2000 && workload.replicas.desired === 1) {
        hasOverprovisioning = true;
        overProvisionedContainers.push(`${container.name} (high CPU request with single replica)`);
      }
    }

    if (hasOverprovisioning) {
      recommendations.push({
        id: generateId("overprovision", workload.kind, workload.name, workload.namespace),
        type: "overprovision",
        severity: "medium",
        targetRef: {
          kind: workload.kind,
          name: workload.name,
          namespace: workload.namespace,
        },
        description: `${workload.kind} ${workload.namespace}/${workload.name} may be overprovisioned. Containers with potential issues: ${overProvisionedContainers.join(", ")}`,
        suggestedAction:
          "Review resource requests and limits. Consider right-sizing based on actual usage metrics.",
      });
    }

    // Check for workloads with 0 ready replicas but desired > 0
    if (workload.replicas.desired > 0 && workload.replicas.ready === 0) {
      recommendations.push({
        id: generateId("scale-down", workload.kind, workload.name, workload.namespace),
        type: "scale-down",
        severity: "medium",
        targetRef: {
          kind: workload.kind,
          name: workload.name,
          namespace: workload.namespace,
        },
        description: `${workload.kind} ${workload.namespace}/${workload.name} has ${workload.replicas.desired} desired replicas but 0 ready. Resources are requested but not being used.`,
        suggestedAction:
          "Investigate why pods are not becoming ready. If not needed, scale to 0 or remove the workload.",
      });
    }
  }

  return recommendations;
}

/**
 * Analyze idle namespaces
 */
function analyzeIdleNamespaces(
  namespaces: NamespaceSummary[],
  workloads: WorkloadInfo[],
  pods: PodInfo[]
): CostRecommendation[] {
  const recommendations: CostRecommendation[] = [];

  for (const ns of namespaces) {
    const nsWorkloads = workloads.filter((w) => w.namespace === ns.name);
    const nsPods = pods.filter((p) => p.namespace === ns.name);
    const runningPods = nsPods.filter((p) => p.phase === "Running");

    // Check for namespaces with workloads but no running pods
    if (nsWorkloads.length > 0 && runningPods.length === 0) {
      recommendations.push({
        id: generateId("idle-namespace", "Namespace", ns.name),
        type: "idle-namespace",
        severity: "low",
        targetRef: {
          kind: "Namespace",
          name: ns.name,
        },
        description: `Namespace ${ns.name} has ${nsWorkloads.length} workloads but no running pods. It may be idle or unused.`,
        suggestedAction:
          "Review if this namespace is still needed. Consider removing unused workloads or the entire namespace.",
      });
    }

    // Check for completely empty namespaces
    if (ns.workloadCount === 0 && ns.podCount === 0) {
      recommendations.push({
        id: generateId("remove-unused", "Namespace", ns.name),
        type: "remove-unused",
        severity: "low",
        targetRef: {
          kind: "Namespace",
          name: ns.name,
        },
        description: `Namespace ${ns.name} has no workloads or pods and may be unused.`,
        suggestedAction: "Consider removing this namespace if it's no longer needed.",
      });
    }
  }

  return recommendations;
}

/**
 * Execute the analyze-cost-optimization tool
 */
async function executeAnalyzeCostOptimization(
  input: AnalyzeCostOptimizationInput,
  context: ToolExecutionContext
): Promise<ToolResult<CostAnalysisResult>> {
  const startTime = Date.now();

  try {
    // Resolve snapshot from either snapshotId or direct snapshot parameter
    let snapshot: ClusterSnapshot;

    if (input.snapshotId) {
      const storedSnapshot = context.snapshotStore?.get(input.snapshotId);
      if (!storedSnapshot) {
        return {
          success: false,
          error: {
            code: "SNAPSHOT_NOT_FOUND",
            message: `Snapshot with ID ${input.snapshotId} not found. Please call get-cluster-snapshot first.`,
          },
          metadata: {
            executionTimeMs: Date.now() - startTime,
          },
        };
      }
      snapshot = storedSnapshot;
    } else if (input.snapshot) {
      snapshot = input.snapshot;
    } else {
      return {
        success: false,
        error: {
          code: "MISSING_SNAPSHOT",
          message: "Must provide either snapshotId or snapshot",
        },
        metadata: {
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const { thresholds, pricingConfig } = input;
    const recommendations: CostRecommendation[] = [];

    // Analyze node utilization
    const nodeRecommendations = analyzeNodeUtilization(
      snapshot.nodes,
      snapshot.pods,
      snapshot.workloads,
      thresholds?.nodeUtilizationLow ?? 0.3
    );
    recommendations.push(...nodeRecommendations);

    // Analyze workload overprovisioning
    const workloadRecommendations = analyzeWorkloadOverprovisioning(
      snapshot.workloads,
      thresholds?.workloadOverprovisionRatio ?? 2
    );
    recommendations.push(...workloadRecommendations);

    // Analyze idle namespaces
    const namespaceRecommendations = analyzeIdleNamespaces(
      snapshot.namespaces,
      snapshot.workloads,
      snapshot.pods
    );
    recommendations.push(...namespaceRecommendations);

    // Calculate total potential savings
    let totalCPUCoreHours = 0;
    let totalMemoryGiBHours = 0;

    for (const rec of recommendations) {
      if (rec.potentialSavings) {
        totalCPUCoreHours += rec.potentialSavings.cpuCoreHours ?? 0;
        totalMemoryGiBHours += rec.potentialSavings.memoryGiBHours ?? 0;
      }
    }

    // Calculate estimated monthly cost if pricing config provided
    let estimatedMonthlyCost: number | undefined;
    if (pricingConfig) {
      const dailySavings =
        totalCPUCoreHours * pricingConfig.cpuCoreHourCost +
        totalMemoryGiBHours * pricingConfig.memoryGiBHourCost;
      estimatedMonthlyCost = dailySavings * 30;
    }

    // Generate summary
    const highSeverity = recommendations.filter((r) => r.severity === "high").length;
    const mediumSeverity = recommendations.filter((r) => r.severity === "medium").length;
    const lowSeverity = recommendations.filter((r) => r.severity === "low").length;

    let summary = `Found ${recommendations.length} cost optimization opportunities`;
    if (recommendations.length > 0) {
      summary += `: ${highSeverity} high, ${mediumSeverity} medium, ${lowSeverity} low severity.`;
    } else {
      summary += ". Your cluster appears to be well-optimized.";
    }

    if (estimatedMonthlyCost !== undefined && estimatedMonthlyCost > 0) {
      summary += ` Estimated potential monthly savings: $${estimatedMonthlyCost.toFixed(2)}.`;
    }

    const result: CostAnalysisResult = {
      summary,
      totalPotentialSavings:
        totalCPUCoreHours > 0 || totalMemoryGiBHours > 0
          ? {
              cpuCoreHours: totalCPUCoreHours,
              memoryGiBHours: totalMemoryGiBHours,
              estimatedMonthlyCost,
            }
          : undefined,
      recommendations,
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
        code: "COST_ANALYSIS_FAILED",
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
 * Analyze Cost Optimization Tool definition
 */
export const analyzeCostOptimizationTool: K8sOpsTool<
  AnalyzeCostOptimizationInput,
  CostAnalysisResult
> = {
  id: "analyze-cost-optimization",
  title: "Analyze Cost Optimization",
  description:
    "Analyzes a cluster snapshot to identify cost optimization opportunities including underutilized nodes, overprovisioned workloads, and idle namespaces. Provides actionable recommendations with potential savings estimates.",
  inputSchema: AnalyzeCostOptimizationInputSchema,
  execute: executeAnalyzeCostOptimization,
};
