/**
 * Neurolink Agent Integration
 * 
 * This file provides a complete Neurolink-based agent that:
 * 1. Uses the MCP tools for K8s operations
 * 2. Uses an LLM (via Neurolink) for reasoning
 * 3. Orchestrates multi-step analysis workflows
 * 4. Generates human-readable summaries
 */

import { K8sOpsAgent } from "../agent/k8sOpsAgent.js";
import { k8sOpsServer } from "../mcp/k8sOpsServer.js";

// Types for Neurolink integration
export interface NeurolinkProvider {
  generate: (options: {
    prompt: string;
    output?: { format: "text" | "json" };
    system?: string;
  }) => Promise<{ text: string }>;
}

export interface NeurolinkInstance {
  addInMemoryMCPServer: (
    serverId: string,
    config: NeurolinkMCPConfig
  ) => Promise<void>;
  getProvider: () => NeurolinkProvider;
}

export interface NeurolinkMCPConfig {
  server: {
    title: string;
    description: string;
    tools: unknown[];
  };
  category: string;
  metadata: {
    version: string;
    author: string;
    lastUpdated: string;
  };
}

/**
 * K8s Ops Neurolink Agent
 * 
 * Combines the K8sOpsAgent with Neurolink's LLM capabilities for:
 * - Natural language understanding
 * - Intelligent summarization
 * - Context-aware recommendations
 */
export class K8sOpsNeurolinkAgent {
  private agent: K8sOpsAgent;
  private provider: NeurolinkProvider | null = null;
  private k8sMode: "kubeconfig" | "incluster";

  constructor(options: {
    k8sMode?: "kubeconfig" | "incluster";
    neurolink?: NeurolinkInstance;
  } = {}) {
    this.k8sMode = options.k8sMode ?? "kubeconfig";
    this.agent = new K8sOpsAgent({
      k8sMode: this.k8sMode,
      verbose: true,
      includeRawData: true,
      logger: console.log.bind(console),
    });

    if (options.neurolink) {
      this.provider = options.neurolink.getProvider();
    }
  }

  /**
   * Set the Neurolink provider for LLM capabilities
   */
  setProvider(provider: NeurolinkProvider): void {
    this.provider = provider;
  }

  /**
   * Process a natural language query about the cluster
   */
  async query(userQuery: string): Promise<string> {
    console.log(`\n🤖 Processing query: "${userQuery}"\n`);

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
 * Register K8s Ops tools with Neurolink
 */
export async function registerWithNeurolink(neurolink: NeurolinkInstance): Promise<void> {
  const config: NeurolinkMCPConfig = {
    server: {
      title: k8sOpsServer.title,
      description: k8sOpsServer.description,
      tools: k8sOpsServer.tools.map((tool) => ({
        id: tool.id,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      })),
    },
    category: k8sOpsServer.category,
    metadata: {
      version: k8sOpsServer.version,
      author: "cmd-err",
      lastUpdated: new Date().toISOString(),
    },
  };

  await neurolink.addInMemoryMCPServer("k8s-ops", config);
  console.log("✅ K8s Ops Server registered with Neurolink");
}

/**
 * Create a standalone Neurolink agent for K8s operations
 */
export function createK8sOpsNeurolinkAgent(options?: {
  k8sMode?: "kubeconfig" | "incluster";
  neurolink?: NeurolinkInstance;
}): K8sOpsNeurolinkAgent {
  return new K8sOpsNeurolinkAgent(options);
}
