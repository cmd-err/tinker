/**
 * Neurolink Agent Integration
 * 
 * This file provides a complete Neurolink-based agent that:
 * 1. Uses the MCP tools for K8s operations
 * 2. Uses an LLM (via Neurolink) for reasoning and orchestration
 * 3. Orchestrates multi-step analysis workflows
 * 4. Generates human-readable summaries
 */

import { K8sOpsAgent } from "../agent/k8sOpsAgent.js";
import { k8sOpsServer } from "../mcp/k8sOpsServer.js";

// Types for Neurolink integration - matching the actual @juspay/neurolink SDK
export interface NeurolinkProvider {
  generate: (options: {
    prompt: string;
    output?: { format: "text" | "json" };
    system?: string;
  }) => Promise<{ text: string; content?: string }>;
}

/**
 * NeuroLink instance interface - matches the actual @juspay/neurolink SDK
 * See: https://github.com/juspay/neurolink/blob/main/src/lib/neurolink.ts
 * Using 'unknown' for MCPServerInfo to avoid type conflicts with external package
 */
export interface NeuroLinkInstance {
  addInMemoryMCPServer: (
    serverId: string,
    serverInfo: unknown
  ) => Promise<void>;
  registerTools: (tools: Array<{ name: string; tool: any }> | Record<string, any>) => void;
  generate: (optionsOrPrompt: GenerateOptions | string) => Promise<GenerateResult>;
  stream: (options: StreamOptions) => Promise<StreamResult>;
  executeTool: <T = unknown>(
    toolName: string,
    params?: unknown,
    options?: { timeout?: number; maxRetries?: number }
  ) => Promise<T>;
  getAllAvailableTools: () => Promise<ToolInfo[]>;
}

// MCPServerInfo matches Neurolink's expected format
export interface MCPServerInfo {
  id: string;
  name: string;
  description: string;
  transport: "stdio" | "sse" | "streamable-http";
  status?: "connected" | "disconnected" | "error" | "connecting";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  tools?: MCPToolDefinition[];
  metadata?: {
    category?: string;
    version?: string;
    provider?: string;
    [key: string]: unknown;
  };
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute?: (params: unknown, context?: unknown) => Promise<unknown>;
}

export interface GenerateOptions {
  input: { text: string };
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  disableTools?: boolean;
}

export interface GenerateResult {
  content: string;
  provider: string;
  model?: string;
  usage?: { input: number; output: number; total: number };
  toolsUsed?: string[];
}

export interface StreamOptions {
  input: { text: string };
  provider?: string;
  model?: string;
}

export interface StreamResult {
  stream: AsyncIterable<{ content: string }>;
  provider: string;
}

export interface ToolInfo {
  name: string;
  description?: string;
  serverId?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * K8s Ops Neurolink Agent
 * 
 * Combines the K8sOpsAgent with Neurolink's LLM capabilities for:
 * - Natural language understanding
 * - LLM-driven tool orchestration (when Neurolink instance provided)
 * - Intelligent summarization
 * - Context-aware recommendations
 * 
 * There are two modes of operation:
 * 1. With Neurolink instance: Uses LLM to orchestrate tool calls via neurolink.generate()
 * 2. Without Neurolink: Uses rule-based intent detection and built-in summarization
 */
export class K8sOpsNeurolinkAgent {
  private agent: K8sOpsAgent;
  private provider: NeurolinkProvider | null = null;
  private neurolink: NeuroLinkInstance | null = null;
  private k8sMode: "kubeconfig" | "incluster";

  constructor(options: {
    k8sMode?: "kubeconfig" | "incluster";
    neurolink?: NeuroLinkInstance;
    provider?: NeurolinkProvider;
  } = {}) {
    this.k8sMode = options.k8sMode ?? "kubeconfig";
    this.agent = new K8sOpsAgent({
      k8sMode: this.k8sMode,
      verbose: true,
      includeRawData: true,
      logger: console.log.bind(console),
    });

    // Store Neurolink instance for LLM orchestration
    if (options.neurolink) {
      this.neurolink = options.neurolink;
    }

    // Accept provider directly if passed
    if (options.provider) {
      this.provider = options.provider;
    }
  }

  /**
   * Set the Neurolink instance for LLM-powered orchestration
   */
  setNeurolink(neurolink: NeuroLinkInstance): void {
    this.neurolink = neurolink;
  }

  /**
   * Set the Neurolink provider for LLM capabilities
   */
  setProvider(provider: NeurolinkProvider): void {
    this.provider = provider;
  }

  /**
   * Process a natural language query about the cluster
   * 
   * If a Neurolink instance is set, uses LLM to orchestrate tool calls.
   * Otherwise, uses rule-based intent detection.
   */
  async query(userQuery: string): Promise<string> {
    console.log(`\n🤖 Processing query: "${userQuery}"\n`);

    // If we have a Neurolink instance, use LLM orchestration
    if (this.neurolink) {
      return await this.queryWithNeurolink(userQuery);
    }

    // Otherwise, use rule-based orchestration
    return await this.queryWithRules(userQuery);
  }

  /**
   * Query using Neurolink LLM orchestration
   * The LLM decides which tools to call based on the query
   * Uses stream() instead of generate() to match lighthouse pattern
   */
  private async queryWithNeurolink(userQuery: string): Promise<string> {
    if (!this.neurolink) {
      throw new Error("Neurolink instance not set");
    }

    console.log("🧠 Using Neurolink LLM for orchestration...\n");

    try {
      // Use stream() instead of generate() - matches lighthouse pattern
      const streamResult = await this.neurolink.stream({
        input: {
          text: userQuery
        },
        systemPrompt: `You are a Kubernetes operations expert assistant with access to cluster analysis tools.

Available tools:
- get-cluster-snapshot: Fetches nodes, pods, workloads, HPAs, and Istio resources from the K8s cluster
- analyze-cost-optimization: Identifies underutilized nodes, overprovisioned workloads, and idle namespaces with savings estimates
- detect-zombie-workloads: Finds crash-looping pods, failed pods, stuck pending pods, and unhealthy nodes
- analyze-istio-traffic: Detects unused/missing subsets, orphan VirtualServices, and misconfigured routes

When analyzing the cluster:
1. First get a cluster snapshot to understand the current state
2. Then run the appropriate analysis tools based on the user's request
3. Synthesize the findings into a clear, actionable report
4. Prioritize issues by severity and provide specific recommendations`,
        temperature: 0.3,
        maxTokens: 4000,
        // Add explicit provider/model like lighthouse does
        provider: process.env.LLM_PROVIDER || "azure",
        model: process.env.LLM_MODEL || "gpt-4o-automatic",
        // CRITICAL: Enable tools for the stream call
        disableTools: false,
        // Context for session tracking
        context: {
          sessionId: `k8s-demo-${Date.now()}`,
        },
      } as any);

      // Process streaming response like lighthouse (sessionInstanceManager.ts:808-894)
      let accumulatedResponse = '';
      let toolsUsed: string[] = [];

      for await (const chunk of streamResult.stream) {
        if (chunk && typeof chunk === 'object') {
          // Handle content chunks
          if ('content' in chunk && typeof chunk.content === 'string') {
            accumulatedResponse += chunk.content;
          }

          // Handle tool execution events
          if ('toolExecution' in chunk && chunk.toolExecution) {
            const toolExecution = chunk.toolExecution as any;
            if (toolExecution.type === 'tool:start') {
              console.log(`🔧 Tool started: ${toolExecution.tool}`);
              if (!toolsUsed.includes(toolExecution.tool)) {
                toolsUsed.push(toolExecution.tool);
              }
            } else if (toolExecution.type === 'tool:end') {
              if (toolExecution.error) {
                console.log(`⚠️  Tool error: ${toolExecution.tool} - ${toolExecution.error}`);
              } else {
                console.log(`✅ Tool completed: ${toolExecution.tool}`);
              }
            }
          }
        }
      }

      if (toolsUsed.length > 0) {
        console.log(`\n🔧 LLM used tools: ${toolsUsed.join(", ")}\n`);
      }

      return accumulatedResponse;

    } catch (error) {
      console.error("⚠️ Neurolink LLM orchestration failed, falling back to rules:", error);
      return await this.queryWithRules(userQuery);
    }
  }

  /**
   * Query using rule-based intent detection (no LLM)
   */
  private async queryWithRules(userQuery: string): Promise<string> {
    // Determine intent from query
    const intent = this.parseIntent(userQuery);
    console.log(`📋 Detected intent: ${intent}`);

    // Run the agent
    const result = await this.agent.run({
      intent,
      includeIstio: intent === "full-cluster-report" || intent === "istio-analysis",
    });

    if (!result.success) {
      return `❌ Analysis failed: ${result.error?.message}`;
    }

    // If we have an LLM provider, use it for summarization
    if (this.provider) {
      return await this.generateLLMSummary(userQuery, result);
    }

    // Otherwise, use the built-in summary
    return this.formatResponse(result);
  }

  /**
   * Parse user intent from natural language
   */
  private parseIntent(query: string): "cluster-health-check" | "cost-optimization" | "zombie-detection" | "istio-analysis" | "full-cluster-report" {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("cost") || lowerQuery.includes("money") || lowerQuery.includes("saving") || lowerQuery.includes("expensive")) {
      return "cost-optimization";
    }

    if (lowerQuery.includes("zombie") || lowerQuery.includes("crash") || lowerQuery.includes("failed") || lowerQuery.includes("stuck") || lowerQuery.includes("dead")) {
      return "zombie-detection";
    }

    if (lowerQuery.includes("istio") || lowerQuery.includes("traffic") || lowerQuery.includes("routing") || lowerQuery.includes("service mesh")) {
      return "istio-analysis";
    }

    if (lowerQuery.includes("health") || lowerQuery.includes("status") || lowerQuery.includes("quick")) {
      return "cluster-health-check";
    }

    // Default to full report
    return "full-cluster-report";
  }

  /**
   * Generate LLM-powered summary
   */
  private async generateLLMSummary(userQuery: string, result: Awaited<ReturnType<typeof this.agent.run>>): Promise<string> {
    if (!this.provider) {
      return this.formatResponse(result);
    }

    const prompt = `You are a Kubernetes operations expert. A user asked: "${userQuery}"

Based on the cluster analysis, here are the findings:

## Summary
- Health Score: ${result.summary.healthScore}/100 (${result.summary.healthStatus})
- Nodes: ${result.summary.stats.nodesHealthy}/${result.summary.stats.nodesTotal} healthy
- Pods: ${result.summary.stats.podsHealthy}/${result.summary.stats.podsTotal} running
- Zombies Found: ${result.summary.stats.zombiesFound}
- Cost Issues: ${result.summary.stats.costIssuesFound}
- Istio Issues: ${result.summary.stats.istioIssuesFound}
${result.summary.potentialMonthlySavings ? `- Potential Savings: ~$${result.summary.potentialMonthlySavings.toFixed(2)}/month` : ""}

## Top Priority Issues
${result.summary.topPriorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}

## Detailed Findings
${result.findings.slice(0, 15).map(f => `- [${f.severity}] ${f.title}: ${f.description}${f.suggestedAction ? ` → ${f.suggestedAction}` : ""}`).join("\n")}

Please provide a concise, actionable response to the user's query. Focus on:
1. Directly answering their question
2. Highlighting the most important issues
3. Providing specific recommendations
4. Keeping the response under 500 words`;

    try {
      const response = await this.provider.generate({
        prompt,
        system: "You are a helpful Kubernetes operations assistant. Be concise, specific, and actionable.",
        output: { format: "text" },
      });

      return response.text;
    } catch (error) {
      console.error("LLM generation failed, using fallback:", error);
      return this.formatResponse(result);
    }
  }

  /**
   * Format response without LLM
   */
  private formatResponse(result: Awaited<ReturnType<typeof this.agent.run>>): string {
    const lines: string[] = [];

    lines.push(`# ${result.summary.headline}\n`);
    lines.push(`**Health Score:** ${result.summary.healthScore}/100\n`);
    
    lines.push(`## Cluster Status`);
    lines.push(`- Nodes: ${result.summary.stats.nodesHealthy}/${result.summary.stats.nodesTotal} healthy`);
    lines.push(`- Pods: ${result.summary.stats.podsHealthy}/${result.summary.stats.podsTotal} running`);
    lines.push(`- Zombies: ${result.summary.stats.zombiesFound}`);
    lines.push(`- Cost Issues: ${result.summary.stats.costIssuesFound}`);
    lines.push(`- Istio Issues: ${result.summary.stats.istioIssuesFound}`);
    
    if (result.summary.potentialMonthlySavings) {
      lines.push(`\n**💰 Potential Savings:** ~$${result.summary.potentialMonthlySavings.toFixed(2)}/month`);
    }

    if (result.summary.topPriorities.length > 0) {
      lines.push(`\n## Top Priorities`);
      result.summary.topPriorities.forEach((p, i) => {
        lines.push(`${i + 1}. ${p}`);
      });
    }

    if (result.findings.length > 0) {
      lines.push(`\n## Key Findings`);
      result.findings.slice(0, 5).forEach(f => {
        lines.push(`- **[${f.severity.toUpperCase()}]** ${f.title}`);
        lines.push(`  ${f.description}`);
        if (f.suggestedAction) {
          lines.push(`  → ${f.suggestedAction}`);
        }
      });
    }

    lines.push(`\n## Summary`);
    lines.push(result.summary.narrative);

    return lines.join("\n");
  }

  /**
   * Run a specific analysis
   */
  async runAnalysis(intent: "cluster-health-check" | "cost-optimization" | "zombie-detection" | "istio-analysis" | "full-cluster-report") {
    return this.agent.run({ intent });
  }
}

/**
 * Register K8s Ops tools with Neurolink using InvestigationContext
 * @param neurolink - NeuroLink instance from @juspay/neurolink
 * @param investigationContext - InvestigationContext for tracking the investigation
 */
export async function registerK8sOpsWithNeurolink(
  neurolink: NeuroLinkInstance,
  investigationContext: any  // Will be InvestigationContext from investigation module
): Promise<void> {
  // Use the investigation context's snapshot store directly
  // No complex session management, just simple in-memory context
  const sharedContext = {
    k8sMode: "kubeconfig" as const,
    investigationContext,  // Pass the whole context
  };

  // Convert K8s tools to the format expected by registerTools()
  const toolsArray = k8sOpsServer.tools.map((tool) => ({
    name: `k8s-ops_${tool.id}`,
    tool: {
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      execute: async (params: unknown, context?: unknown) => {
        // Add breadcrumb for this tool execution
        sharedContext.investigationContext.addBreadcrumb(`Executing ${tool.id}`);

        // Build tool context with investigation data
        const toolContext = {
          k8sMode: sharedContext.k8sMode,
          snapshotStore: sharedContext.investigationContext.snapshotStore,
          investigation: {
            goal: sharedContext.investigationContext.goal,
            snapshotStore: sharedContext.investigationContext.snapshotStore,
            findings: sharedContext.investigationContext.findings,
            breadcrumbs: sharedContext.investigationContext.breadcrumbs,
            addFinding: sharedContext.investigationContext.addFinding.bind(sharedContext.investigationContext),
            addBreadcrumb: sharedContext.investigationContext.addBreadcrumb.bind(sharedContext.investigationContext),
          }
        };

        // Call the tool's execute function
        const result = await tool.execute(
          params as Record<string, unknown>,
          toolContext
        );

        // Auto-accumulate findings from different tool result formats
        if (result && typeof result === 'object' && 'success' in result && result.success) {
          const resultData = (result as any).data;

          // Direct findings array
          if (resultData?.findings && Array.isArray(resultData.findings)) {
            resultData.findings.forEach((finding: any) => {
              sharedContext.investigationContext.addFinding(finding);
            });
          }

          // Cost optimization recommendations → findings
          if (resultData?.recommendations && Array.isArray(resultData.recommendations)) {
            resultData.recommendations.forEach((rec: any) => {
              sharedContext.investigationContext.addFinding({
                title: `Cost: ${rec.type}`,
                description: rec.description,
                severity: rec.severity === 'high' ? 'high' : rec.severity === 'medium' ? 'medium' : 'low',
                category: 'cost-optimization',
                suggestedAction: rec.suggestedAction,
                evidence: {
                  targetRef: rec.targetRef,
                  potentialSavings: rec.potentialSavings,
                },
              });
            });
          }

          // Zombie workloads → findings
          if (resultData?.zombies && Array.isArray(resultData.zombies)) {
            resultData.zombies.forEach((zombie: any) => {
              sharedContext.investigationContext.addFinding({
                title: `Zombie: ${zombie.kind} ${zombie.name}`,
                description: zombie.reason,
                severity: zombie.severity === 'high' ? 'high' : zombie.severity === 'medium' ? 'medium' : 'low',
                category: 'zombie-workload',
                suggestedAction: zombie.suggestedAction,
                evidence: {
                  kind: zombie.kind,
                  name: zombie.name,
                  namespace: zombie.namespace,
                  lastActivityTime: zombie.lastActivityTime,
                  details: zombie.details,
                },
              });
            });
          }

          // Istio traffic issues → findings
          if (resultData?.issues && Array.isArray(resultData.issues)) {
            resultData.issues.forEach((issue: any) => {
              sharedContext.investigationContext.addFinding({
                title: `Istio: ${issue.type}`,
                description: issue.description,
                severity: issue.severity === 'high' ? 'high' : issue.severity === 'medium' ? 'medium' : 'low',
                category: 'istio-traffic',
                suggestedAction: issue.suggestedFix,
                evidence: {
                  type: issue.type,
                  relatedResources: issue.relatedResources,
                },
              });
            });
          }
        }

        // Return result data directly (Neurolink expects unwrapped data)
        if (result && typeof result === 'object' && 'success' in result && result.success) {
          return (result as any).data || result;
        }

        // If execution failed, throw an error
        if (result && typeof result === 'object' && 'success' in result && !result.success) {
          throw new Error((result as any).error?.message || 'Tool execution failed');
        }

        // Return the result directly
        return result;
      },
    }
  }));

  // Register tools with Neurolink
  neurolink.registerTools(toolsArray as any);
  console.log("✅ K8s Ops Server registered with Neurolink (using InvestigationContext)");
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use registerK8sOpsWithNeurolink instead
 */
export const registerWithNeurolink = registerK8sOpsWithNeurolink;

/**
 * Create a standalone Neurolink agent for K8s operations
 */
export function createK8sOpsNeurolinkAgent(options?: {
  k8sMode?: "kubeconfig" | "incluster";
  neurolink?: NeuroLinkInstance;
  provider?: NeurolinkProvider;
}): K8sOpsNeurolinkAgent {
  return new K8sOpsNeurolinkAgent(options);
}
