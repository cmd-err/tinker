/**
 * K8s Ops Agent
 * The orchestration layer that runs analysis workflows and generates summaries
 *
 * This is the AGENT - it:
 * - Receives high-level intents (e.g., "analyze cluster health")
 * - Plans which tools to call
 * - Executes tools in sequence
 * - Aggregates and summarizes results
 * - Generates actionable findings
 */

import { k8sOpsServer } from "../mcp/k8sOpsServer.js";
import type { ToolExecutionContext, ClusterSnapshot } from "../types.js";
import type {
  AgentRequest,
  AgentResponse,
  AgentConfig,
  AgentStep,
  AgentFinding,
  AgentSummary,
  AgentIntent,
  AgentEventHandler,
  AgentEvent,
} from "./agentTypes.js";

// ============ Agent Implementation ============

/**
 * K8s Ops Agent - orchestrates tools to analyze Kubernetes clusters
 */
export class K8sOpsAgent {
  private config: AgentConfig;
  private eventHandlers: AgentEventHandler[] = [];

  constructor(config: AgentConfig) {
    this.config = {
      verbose: false,
      timeout: 120000, // 2 minutes default
      includeRawData: false,
      ...config,
    };
  }

  /**
   * Register an event handler for progress updates
   */
  onEvent(handler: AgentEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: AgentEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  /**
   * Log a message if verbose mode is enabled
   */
  private log(message: string): void {
    if (this.config.verbose && this.config.logger) {
      this.config.logger(message);
    }
  }

  /**
   * Run the agent with a given request
   */
  async run(request: AgentRequest): Promise<AgentResponse> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const steps: AgentStep[] = [];

    this.emit({
      type: "agent-started",
      timestamp: startedAt,
      data: { intent: request.intent, message: `Starting ${request.intent} analysis` },
    });

    this.log(`🚀 Agent starting: ${request.intent}`);

    try {
      // Plan which tools to run based on intent
      const toolPlan = this.planTools(request.intent);
      this.log(`📋 Tool plan: ${toolPlan.join(" → ")}`);

      // Execute tools in sequence
      const context: ToolExecutionContext = {
        k8sMode: this.config.k8sMode,
        timeout: this.config.timeout,
        logger: this.config.verbose ? this.config.logger : undefined,
      };

      let snapshot: ClusterSnapshot | undefined;
      let costAnalysis: unknown;
      let zombieDetection: unknown;
      let istioAnalysis: unknown;

      for (let i = 0; i < toolPlan.length; i++) {
        const toolId = toolPlan[i];
        const stepNumber = i + 1;

        const step: AgentStep = {
          stepNumber,
          toolId,
          status: "running",
          startedAt: new Date().toISOString(),
        };
        steps.push(step);

        this.emit({
          type: "step-started",
          timestamp: step.startedAt!,
          data: {
            step,
            progress: Math.round((i / toolPlan.length) * 100),
            message: `Running ${toolId}...`,
          },
        });

        this.log(`⚙️  Step ${stepNumber}/${toolPlan.length}: ${toolId}`);

        const stepStartTime = Date.now();

        try {
          // Prepare input based on tool
          let input: unknown;

          if (toolId === "get-cluster-snapshot") {
            input = {
              namespaces: request.namespaces,
              includeIstio: request.includeIstio ?? true,
              includeSystemNamespaces: false,
            };
          } else if (toolId === "analyze-cost-optimization") {
            input = {
              snapshot,
              thresholds: {
                nodeUtilizationLow: request.thresholds?.nodeUtilizationLow ?? 0.3,
                workloadOverprovisionRatio: request.thresholds?.workloadOverprovisionRatio ?? 2,
                idlePodThresholdHours: request.thresholds?.idlePodThresholdHours ?? 24,
              },
            };
          } else if (toolId === "detect-zombie-workloads") {
            input = {
              snapshot,
              thresholds: {
                idleDaysThreshold: request.thresholds?.idleDaysThreshold ?? 7,
                crashLoopRestartThreshold: request.thresholds?.crashLoopRestartThreshold ?? 5,
                stuckPodHours: 24,
              },
            };
          } else if (toolId === "analyze-istio-traffic") {
            input = {
              snapshot,
              options: {
                includeTopology: true,
                checkMTLS: true,
              },
            };
          }

          // Execute the tool
          const result = await k8sOpsServer.executeTool(toolId, input, context);

          if (!result.success) {
            throw new Error(result.error?.message ?? "Tool execution failed");
          }

          // Store results
          if (toolId === "get-cluster-snapshot") {
            snapshot = result.data as ClusterSnapshot;
          } else if (toolId === "analyze-cost-optimization") {
            costAnalysis = result.data;
          } else if (toolId === "detect-zombie-workloads") {
            zombieDetection = result.data;
          } else if (toolId === "analyze-istio-traffic") {
            istioAnalysis = result.data;
          }

          step.status = "success";
          step.completedAt = new Date().toISOString();
          step.durationMs = Date.now() - stepStartTime;

          this.emit({
            type: "step-completed",
            timestamp: step.completedAt,
            data: {
              step,
              progress: Math.round(((i + 1) / toolPlan.length) * 100),
              message: `${toolId} completed in ${step.durationMs}ms`,
            },
          });

          this.log(`✅ Step ${stepNumber} completed in ${step.durationMs}ms`);
        } catch (error) {
          step.status = "error";
          step.completedAt = new Date().toISOString();
          step.durationMs = Date.now() - stepStartTime;
          step.error = error instanceof Error ? error.message : String(error);

          this.emit({
            type: "step-failed",
            timestamp: step.completedAt,
            data: {
              step,
              error: step.error,
              message: `${toolId} failed: ${step.error}`,
            },
          });

          this.log(`❌ Step ${stepNumber} failed: ${step.error}`);

          // For snapshot, we can't continue
          if (toolId === "get-cluster-snapshot") {
            throw error;
          }
          // For other tools, continue but note the error
        }
      }

      // Generate findings from all results
      const findings = this.generateFindings(snapshot, costAnalysis, zombieDetection, istioAnalysis);

      // Generate executive summary
      const summary = this.generateSummary(
        request.intent,
        snapshot,
        costAnalysis,
        zombieDetection,
        istioAnalysis,
        findings
      );

      const completedAt = new Date().toISOString();
      const totalDurationMs = Date.now() - startTime;

      this.emit({
        type: "agent-completed",
        timestamp: completedAt,
        data: {
          intent: request.intent,
          progress: 100,
          message: summary.headline,
        },
      });

      this.log(`🎉 Agent completed in ${totalDurationMs}ms`);
      this.log(`📊 ${summary.headline}`);

      return {
        success: true,
        intent: request.intent,
        startedAt,
        completedAt,
        totalDurationMs,
        steps,
        summary,
        findings,
        rawData: this.config.includeRawData
          ? {
              snapshot,
              costAnalysis: costAnalysis as AgentResponse["rawData"] extends { costAnalysis: infer T } ? T : never,
              zombieDetection: zombieDetection as AgentResponse["rawData"] extends { zombieDetection: infer T } ? T : never,
              istioAnalysis: istioAnalysis as AgentResponse["rawData"] extends { istioAnalysis: infer T } ? T : never,
            }
          : undefined,
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emit({
        type: "agent-failed",
        timestamp: completedAt,
        data: {
          intent: request.intent,
          error: errorMessage,
          message: `Agent failed: ${errorMessage}`,
        },
      });

      this.log(`💥 Agent failed: ${errorMessage}`);

      return {
        success: false,
        intent: request.intent,
        startedAt,
        completedAt,
        totalDurationMs: Date.now() - startTime,
        steps,
        summary: this.generateErrorSummary(errorMessage),
        findings: [],
        error: {
          code: "AGENT_ERROR",
          message: errorMessage,
        },
      };
    }
  }

  /**
   * Plan which tools to run based on intent
   */
  private planTools(intent: AgentIntent): string[] {
    switch (intent) {
      case "cluster-health-check":
        return ["get-cluster-snapshot", "detect-zombie-workloads"];

      case "cost-optimization":
        return ["get-cluster-snapshot", "analyze-cost-optimization"];

      case "zombie-detection":
        return ["get-cluster-snapshot", "detect-zombie-workloads"];

      case "istio-analysis":
        return ["get-cluster-snapshot", "analyze-istio-traffic"];

      case "full-cluster-report":
        return [
          "get-cluster-snapshot",
          "analyze-cost-optimization",
          "detect-zombie-workloads",
          "analyze-istio-traffic",
        ];

      default:
        return ["get-cluster-snapshot"];
    }
  }

  /**
   * Generate findings from tool results
   */
  private generateFindings(
    snapshot?: ClusterSnapshot,
    costAnalysis?: unknown,
    zombieDetection?: unknown,
    istioAnalysis?: unknown
  ): AgentFinding[] {
    const findings: AgentFinding[] = [];

    // Cost findings
    if (costAnalysis && typeof costAnalysis === "object" && "recommendations" in costAnalysis) {
      const cost = costAnalysis as { recommendations: Array<{
        id: string;
        type: string;
        severity: string;
        description: string;
        targetRef: { kind: string; name: string; namespace?: string };
        suggestedAction: string;
        potentialSavings?: { estimatedMonthlyCost?: number };
      }> };
      for (const rec of cost.recommendations) {
        findings.push({
          id: `cost-${rec.id}`,
          category: "cost",
          severity: rec.severity as AgentFinding["severity"],
          title: `${rec.type}: ${rec.targetRef.name}`,
          description: rec.description,
          resource: rec.targetRef,
          suggestedAction: rec.suggestedAction,
          impact: rec.potentialSavings?.estimatedMonthlyCost
            ? `~$${rec.potentialSavings.estimatedMonthlyCost.toFixed(2)}/month`
            : undefined,
        });
      }
    }

    // Zombie findings
    if (zombieDetection && typeof zombieDetection === "object" && "zombies" in zombieDetection) {
      const zombies = zombieDetection as { zombies: Array<{
        id: string;
        kind: string;
        name: string;
        namespace?: string;
        severity: string;
        reason: string;
        suggestedAction: string;
      }> };
      for (const zombie of zombies.zombies) {
        findings.push({
          id: `zombie-${zombie.id}`,
          category: "zombie",
          severity: zombie.severity as AgentFinding["severity"],
          title: `Zombie ${zombie.kind}: ${zombie.name}`,
          description: zombie.reason,
          resource: {
            kind: zombie.kind,
            name: zombie.name,
            namespace: zombie.namespace,
          },
          suggestedAction: zombie.suggestedAction,
        });
      }
    }

    // Istio findings
    if (istioAnalysis && typeof istioAnalysis === "object" && "issues" in istioAnalysis) {
      const istio = istioAnalysis as { issues: Array<{
        id: string;
        type: string;
        severity: string;
        description: string;
        relatedResources: Array<{ kind: string; name: string; namespace: string }>;
        suggestedFix?: string;
      }> };
      for (const issue of istio.issues) {
        const resource = issue.relatedResources[0];
        findings.push({
          id: `istio-${issue.id}`,
          category: "istio",
          severity: issue.severity as AgentFinding["severity"],
          title: `${issue.type}: ${resource?.name ?? "Unknown"}`,
          description: issue.description,
          resource: resource,
          suggestedAction: issue.suggestedFix,
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return findings;
  }

  /**
   * Generate executive summary
   */
  private generateSummary(
    intent: AgentIntent,
    snapshot?: ClusterSnapshot,
    costAnalysis?: unknown,
    zombieDetection?: unknown,
    istioAnalysis?: unknown,
    findings?: AgentFinding[]
  ): AgentSummary {
    const nodesTotal = snapshot?.nodes.length ?? 0;
    const nodesHealthy = snapshot?.nodes.filter((n) =>
      n.conditions.some((c) => c.type === "Ready" && c.status === "True")
    ).length ?? 0;
    const podsTotal = snapshot?.pods.length ?? 0;
    const podsHealthy = snapshot?.pods.filter((p) => p.phase === "Running").length ?? 0;

    const zombieCount = zombieDetection && typeof zombieDetection === "object" && "zombieCount" in zombieDetection
      ? (zombieDetection as { zombieCount: number }).zombieCount
      : 0;

    const costIssues = costAnalysis && typeof costAnalysis === "object" && "recommendations" in costAnalysis
      ? (costAnalysis as { recommendations: unknown[] }).recommendations.length
      : 0;

    const istioIssues = istioAnalysis && typeof istioAnalysis === "object" && "issueCount" in istioAnalysis
      ? (istioAnalysis as { issueCount: number }).issueCount
      : 0;

    const potentialSavings = costAnalysis && typeof costAnalysis === "object" && "totalPotentialSavings" in costAnalysis
      ? (costAnalysis as { totalPotentialSavings?: { estimatedMonthlyCost?: number } }).totalPotentialSavings?.estimatedMonthlyCost
      : undefined;

    // Calculate health score (0-100)
    let healthScore = 100;
    if (nodesTotal > 0) {
      healthScore -= Math.round((1 - nodesHealthy / nodesTotal) * 30); // Up to -30 for unhealthy nodes
    }
    if (podsTotal > 0) {
      healthScore -= Math.round((1 - podsHealthy / podsTotal) * 30); // Up to -30 for unhealthy pods
    }
    healthScore -= Math.min(zombieCount * 5, 20); // Up to -20 for zombies
    healthScore -= Math.min(costIssues * 2, 10); // Up to -10 for cost issues
    healthScore -= Math.min(istioIssues * 3, 10); // Up to -10 for istio issues
    healthScore = Math.max(0, healthScore);

    const healthStatus: AgentSummary["healthStatus"] =
      healthScore >= 80 ? "healthy" : healthScore >= 50 ? "warning" : "critical";

    // Generate headline
    let headline: string;
    if (healthScore >= 90) {
      headline = `✅ Cluster is healthy (${nodesHealthy}/${nodesTotal} nodes, ${podsHealthy}/${podsTotal} pods running)`;
    } else if (healthScore >= 70) {
      headline = `⚠️ Cluster needs attention: ${findings?.filter((f) => f.severity === "high").length ?? 0} high-priority issues found`;
    } else {
      headline = `🚨 Cluster has critical issues: ${zombieCount} zombies, ${costIssues} cost issues`;
    }

    // Top priorities
    const topPriorities: string[] = [];
    if (findings) {
      const highPriority = findings.filter((f) => f.severity === "high" || f.severity === "critical");
      for (const finding of highPriority.slice(0, 3)) {
        topPriorities.push(finding.title);
      }
    }
    if (topPriorities.length === 0) {
      topPriorities.push("No critical issues found");
    }

    // Generate narrative
    const narrativeParts: string[] = [];

    // Cluster overview
    narrativeParts.push(
      `Analyzed cluster with ${nodesTotal} nodes and ${podsTotal} pods across ${snapshot?.namespaces.length ?? 0} namespaces.`
    );

    // Health status
    if (nodesHealthy < nodesTotal) {
      narrativeParts.push(`${nodesTotal - nodesHealthy} node(s) are unhealthy and need attention.`);
    }
    if (podsHealthy < podsTotal) {
      narrativeParts.push(`${podsTotal - podsHealthy} pod(s) are not running properly.`);
    }

    // Zombies
    if (zombieCount > 0) {
      narrativeParts.push(`Found ${zombieCount} zombie workload(s) that should be investigated or cleaned up.`);
    }

    // Cost
    if (costIssues > 0) {
      narrativeParts.push(
        `Identified ${costIssues} cost optimization opportunit${costIssues === 1 ? "y" : "ies"}${
          potentialSavings ? ` with potential savings of ~$${potentialSavings.toFixed(2)}/month` : ""
        }.`
      );
    }

    // Istio
    if (istioIssues > 0) {
      narrativeParts.push(`Detected ${istioIssues} Istio configuration issue(s) that may affect traffic routing.`);
    }

    // Conclusion
    if (healthScore >= 90) {
      narrativeParts.push("Overall, the cluster is in good health with no major issues detected.");
    } else if (healthScore >= 70) {
      narrativeParts.push("The cluster is functional but has issues that should be addressed soon.");
    } else {
      narrativeParts.push("Immediate attention is recommended to address the critical issues found.");
    }

    return {
      headline,
      healthScore,
      healthStatus,
      stats: {
        nodesTotal,
        nodesHealthy,
        podsTotal,
        podsHealthy,
        zombiesFound: zombieCount,
        costIssuesFound: costIssues,
        istioIssuesFound: istioIssues,
      },
      topPriorities,
      potentialMonthlySavings: potentialSavings,
      narrative: narrativeParts.join(" "),
    };
  }

  /**
   * Generate error summary
   */
  private generateErrorSummary(errorMessage: string): AgentSummary {
    return {
      headline: `❌ Analysis failed: ${errorMessage}`,
      healthScore: 0,
      healthStatus: "critical",
      stats: {
        nodesTotal: 0,
        nodesHealthy: 0,
        podsTotal: 0,
        podsHealthy: 0,
        zombiesFound: 0,
        costIssuesFound: 0,
        istioIssuesFound: 0,
      },
      topPriorities: ["Fix the error and retry"],
      narrative: `The analysis could not be completed due to an error: ${errorMessage}. Please check your cluster connectivity and permissions, then try again.`,
    };
  }
}

// ============ Convenience Functions ============

/**
 * Create a new K8s Ops Agent instance
 */
export function createK8sOpsAgent(config: AgentConfig): K8sOpsAgent {
  return new K8sOpsAgent(config);
}

/**
 * Run a quick cluster health check
 */
export async function quickHealthCheck(
  k8sMode: "kubeconfig" | "incluster" = "kubeconfig"
): Promise<AgentResponse> {
  const agent = new K8sOpsAgent({ k8sMode });
  return agent.run({ intent: "cluster-health-check" });
}

/**
 * Run a full cluster report
 */
export async function fullClusterReport(
  k8sMode: "kubeconfig" | "incluster" = "kubeconfig",
  options?: { namespaces?: string[]; includeIstio?: boolean }
): Promise<AgentResponse> {
  const agent = new K8sOpsAgent({ k8sMode, includeRawData: true });
  return agent.run({
    intent: "full-cluster-report",
    namespaces: options?.namespaces,
    includeIstio: options?.includeIstio ?? true,
  });
}

/**
 * Run cost optimization analysis
 */
export async function analyzeCosts(
  k8sMode: "kubeconfig" | "incluster" = "kubeconfig"
): Promise<AgentResponse> {
  const agent = new K8sOpsAgent({ k8sMode });
  return agent.run({ intent: "cost-optimization" });
}

/**
 * Run zombie detection
 */
export async function findZombies(
  k8sMode: "kubeconfig" | "incluster" = "kubeconfig"
): Promise<AgentResponse> {
  const agent = new K8sOpsAgent({ k8sMode });
  return agent.run({ intent: "zombie-detection" });
}
