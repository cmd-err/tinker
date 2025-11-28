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
   */
  private async queryWithNeurolink(userQuery: string): Promise<string> {
    if (!this.neurolink) {
      throw new Error("Neurolink instance not set");
    }

    console.log("🧠 Using Neurolink LLM for orchestration...\n");

    try {
      const result = await this.neurolink.generate({
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
      });

      // Log tool usage if available
      if (result.toolsUsed && result.toolsUsed.length > 0) {
        console.log(`🔧 LLM used tools: ${result.toolsUsed.join(", ")}`);
      }

      return result.content;

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
 * Register K8s Ops tools with Neurolink using the correct MCPServerInfo format
 * @param neurolink - NeuroLink instance from @juspay/neurolink
 */
export async function registerK8sOpsWithNeurolink(neurolink: NeuroLinkInstance): Promise<void> {
  // Convert our tools to MCPServerInfo format expected by Neurolink
  const serverInfo: MCPServerInfo = {
    id: "k8s-ops",
    name: k8sOpsServer.title,
    description: k8sOpsServer.description,
    transport: "stdio",
    status: "connected",
    tools: k8sOpsServer.tools.map((tool) => ({
      name: tool.id,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      execute: async (params: unknown) => {
        const result = await k8sOpsServer.executeTool(
          tool.id,
          params as Record<string, unknown>,
          { k8sMode: "kubeconfig" }
        );
        return result;
      },
    })),
    metadata: {
      category: k8sOpsServer.category,
      version: k8sOpsServer.version,
      provider: "k8s-ops-agent",
    },
  };

  await neurolink.addInMemoryMCPServer("k8s-ops", serverInfo);
  console.log("✅ K8s Ops Server registered with Neurolink");
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
