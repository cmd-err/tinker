#!/usr/bin/env node
/**
 * K8s Ops MCP Server
 * 
 * A proper MCP server using the official @modelcontextprotocol/sdk
 * This can be used with any MCP host (Claude Desktop, Neurolink, etc.)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { K8sOpsAgent } from "./agent/k8sOpsAgent.js";
import { k8sOpsServer } from "./mcp/k8sOpsServer.js";
import type { ToolExecutionContext } from "./types.js";

// Get K8s mode from environment
const k8sMode = (process.env.K8S_MODE === "incluster" ? "incluster" : "kubeconfig") as "kubeconfig" | "incluster";

// Create the MCP server
const server = new McpServer({
  name: "k8s-ops-agent",
  version: "0.1.0",
});

// Default context for tool execution
const defaultContext: ToolExecutionContext = {
  k8sMode,
  timeout: 120000,
};

// ============ Register Tools ============

// Tool: get-cluster-snapshot
server.tool(
  "get-cluster-snapshot",
  "Fetches a comprehensive snapshot of Kubernetes cluster state including nodes, namespaces, workloads, pods, HPAs, and Istio resources (VirtualServices, DestinationRules, Gateways)",
  {
    namespaces: z.array(z.string()).optional().describe("Filter to specific namespaces (empty = all non-system namespaces)"),
    includeIstio: z.boolean().default(true).describe("Include Istio resources in the snapshot"),
    includeSystemNamespaces: z.boolean().default(false).describe("Include kube-system and other system namespaces"),
  },
  async (args) => {
    const result = await k8sOpsServer.executeTool("get-cluster-snapshot", args, defaultContext);
    
    if (!result.success) {
      return {
        content: [{ type: "text" as const, text: `Error: ${result.error?.message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

// Tool: analyze-cost-optimization
server.tool(
  "analyze-cost-optimization",
  "Analyzes cluster resources for cost optimization opportunities. Identifies underutilized nodes, overprovisioned workloads, and idle namespaces with estimated savings.",
  {
    thresholds: z.object({
      nodeUtilizationLow: z.number().default(0.3).describe("Threshold below which a node is considered underutilized (0-1)"),
      workloadOverprovisionRatio: z.number().default(2).describe("Ratio of requests to actual usage that indicates overprovisioning"),
      idlePodThresholdHours: z.number().default(24).describe("Hours of low activity before a pod is considered idle"),
    }).optional().describe("Thresholds for cost analysis"),
  },
  async (args) => {
    // First get the snapshot
    const snapshotResult = await k8sOpsServer.executeTool("get-cluster-snapshot", { includeIstio: false }, defaultContext);
    
    if (!snapshotResult.success) {
      return {
        content: [{ type: "text" as const, text: `Error getting snapshot: ${snapshotResult.error?.message}` }],
        isError: true,
      };
    }

    const result = await k8sOpsServer.executeTool("analyze-cost-optimization", {
      snapshot: snapshotResult.data,
      thresholds: args.thresholds,
    }, defaultContext);
    
    if (!result.success) {
      return {
        content: [{ type: "text" as const, text: `Error: ${result.error?.message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

// Tool: detect-zombie-workloads
server.tool(
  "detect-zombie-workloads",
  "Detects zombie workloads in the cluster - crash-looping pods, failed pods, stuck pending pods, unhealthy nodes, and abandoned namespaces.",
  {
    thresholds: z.object({
      idleDaysThreshold: z.number().default(7).describe("Days of inactivity before a namespace is considered abandoned"),
      crashLoopRestartThreshold: z.number().default(5).describe("Number of restarts to identify crash loops"),
      stuckPodHours: z.number().default(24).describe("Hours a pod can be pending before considered stuck"),
    }).optional().describe("Thresholds for zombie detection"),
  },
  async (args) => {
    // First get the snapshot
    const snapshotResult = await k8sOpsServer.executeTool("get-cluster-snapshot", { includeIstio: false }, defaultContext);
    
    if (!snapshotResult.success) {
      return {
        content: [{ type: "text" as const, text: `Error getting snapshot: ${snapshotResult.error?.message}` }],
        isError: true,
      };
    }

    const result = await k8sOpsServer.executeTool("detect-zombie-workloads", {
      snapshot: snapshotResult.data,
      thresholds: args.thresholds,
    }, defaultContext);
    
    if (!result.success) {
      return {
        content: [{ type: "text" as const, text: `Error: ${result.error?.message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

// Tool: analyze-istio-traffic
server.tool(
  "analyze-istio-traffic",
  "Analyzes Istio traffic configuration for issues - unused subsets, missing subsets, orphan VirtualServices, stale mirrors, and misconfigured routes.",
  {
    options: z.object({
      includeTopology: z.boolean().default(true).describe("Include traffic topology graph"),
      checkMTLS: z.boolean().default(true).describe("Check for mTLS configuration issues"),
    }).optional().describe("Analysis options"),
  },
  async (args) => {
    // First get the snapshot with Istio resources
    const snapshotResult = await k8sOpsServer.executeTool("get-cluster-snapshot", { includeIstio: true }, defaultContext);
    
    if (!snapshotResult.success) {
      return {
        content: [{ type: "text" as const, text: `Error getting snapshot: ${snapshotResult.error?.message}` }],
        isError: true,
      };
    }

    const result = await k8sOpsServer.executeTool("analyze-istio-traffic", {
      snapshot: snapshotResult.data,
      options: args.options,
    }, defaultContext);
    
    if (!result.success) {
      return {
        content: [{ type: "text" as const, text: `Error: ${result.error?.message}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
    };
  }
);

// Tool: run-full-analysis (Agent tool)
server.tool(
  "run-full-analysis",
  "Runs a complete cluster analysis using the K8s Ops Agent. Orchestrates multiple tools, aggregates findings, and generates an executive summary with health score, priorities, and recommendations.",
  {
    intent: z.enum([
      "cluster-health-check",
      "cost-optimization", 
      "zombie-detection",
      "istio-analysis",
      "full-cluster-report"
    ]).default("full-cluster-report").describe("Analysis intent"),
    namespaces: z.array(z.string()).optional().describe("Filter to specific namespaces"),
    includeIstio: z.boolean().default(true).describe("Include Istio analysis"),
  },
  async (args) => {
    const agent = new K8sOpsAgent({ 
      k8sMode,
      verbose: true,
      logger: console.error.bind(console),
    });

    const result = await agent.run({
      intent: args.intent,
      namespaces: args.namespaces,
      includeIstio: args.includeIstio,
    });

    if (!result.success) {
      return {
        content: [{ type: "text" as const, text: `Error: ${result.error?.message}` }],
        isError: true,
      };
    }

    // Format a nice summary
    const summary = `
# K8s Ops Agent Report

## ${result.summary.headline}

**Health Score:** ${result.summary.healthScore}/100 (${result.summary.healthStatus})

### Key Stats
- Nodes: ${result.summary.stats.nodesHealthy}/${result.summary.stats.nodesTotal} healthy
- Pods: ${result.summary.stats.podsHealthy}/${result.summary.stats.podsTotal} running
- Zombies Found: ${result.summary.stats.zombiesFound}
- Cost Issues: ${result.summary.stats.costIssuesFound}
- Istio Issues: ${result.summary.stats.istioIssuesFound}

### Top Priorities
${result.summary.topPriorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}

${result.summary.potentialMonthlySavings ? `### Potential Savings\n~$${result.summary.potentialMonthlySavings.toFixed(2)}/month` : ""}

### Summary
${result.summary.narrative}

### Findings (${result.findings.length} total)
${result.findings.slice(0, 10).map(f => `- **[${f.severity.toUpperCase()}]** ${f.title}: ${f.description}`).join("\n")}
${result.findings.length > 10 ? `\n... and ${result.findings.length - 10} more findings` : ""}
`;

    return {
      content: [{ type: "text" as const, text: summary }],
    };
  }
);

// ============ Start Server ============

async function main() {
  console.error("Starting K8s Ops MCP Server...");
  console.error(`K8s Mode: ${k8sMode}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("K8s Ops MCP Server running on stdio");
}

main().catch(console.error);
