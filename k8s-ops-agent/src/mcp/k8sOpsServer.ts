/**
 * K8s Ops MCP Server
 * Main server abstraction for the Kubernetes Cost & Traffic Ops Agent
 */

import type { K8sOpsTool, ToolExecutionContext, ToolResult } from "../types.js";
import { getClusterSnapshotTool } from "./tools/getClusterSnapshot.js";
import { analyzeCostOptimizationTool } from "./tools/analyzeCostOptimization.js";
import { detectZombieWorkloadsTool } from "./tools/detectZombieWorkloads.js";
import { analyzeIstioTrafficTool } from "./tools/analyzeIstioTraffic.js";
import { investigateDeeperTool } from "./tools/investigateDeeper.js";

/**
 * Configuration for creating a K8s Ops Server
 */
export interface K8sOpsServerConfig {
  /** Server ID */
  id?: string;
  /** Server title */
  title?: string;
  /** Server description */
  description?: string;
  /** Category for Neurolink */
  category?: string;
  /** Server version */
  version?: string;
}

/**
 * K8s Ops Server definition
 */
export interface K8sOpsServer {
  /** Unique server identifier */
  id: string;
  /** Human-readable title */
  title: string;
  /** Server description */
  description: string;
  /** Category for organization */
  category: string;
  /** Server version */
  version: string;
  /** Available tools */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: K8sOpsTool<any, any>[];
  /** Execute a tool by ID */
  executeTool: <TInput, TOutput>(
    toolId: string,
    input: TInput,
    context: ToolExecutionContext
  ) => Promise<ToolResult<TOutput>>;
  /** Get a tool by ID */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTool: (toolId: string) => K8sOpsTool<any, any> | undefined;
  /** List all tool IDs */
  listToolIds: () => string[];
}

/**
 * Create a K8s Ops MCP Server instance
 */
export function createK8sOpsServer(config?: K8sOpsServerConfig): K8sOpsServer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: K8sOpsTool<any, any>[] = [
    getClusterSnapshotTool,
    analyzeCostOptimizationTool,
    detectZombieWorkloadsTool,
    analyzeIstioTrafficTool,
    investigateDeeperTool,
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolMap = new Map<string, K8sOpsTool<any, any>>(tools.map((t) => [t.id, t]));

  return {
    id: config?.id ?? "k8s-ops",
    title: config?.title ?? "Kubernetes Cost & Traffic Ops",
    description:
      config?.description ??
      "MCP server for Kubernetes cluster analysis including cost optimization, zombie workload detection, and Istio traffic analysis",
    category: config?.category ?? "analysis",
    version: config?.version ?? "0.1.0",
    tools,

    executeTool: async <TInput, TOutput>(
      toolId: string,
      input: TInput,
      context: ToolExecutionContext
    ): Promise<ToolResult<TOutput>> => {
      const tool = toolMap.get(toolId);
      if (!tool) {
        return {
          success: false,
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool "${toolId}" not found`,
          },
          metadata: {
            executionTimeMs: 0,
          },
        };
      }

      return tool.execute(input, context) as Promise<ToolResult<TOutput>>;
    },

    getTool: (toolId: string) => toolMap.get(toolId),

    listToolIds: () => [...toolMap.keys()],
  };
}

/**
 * Default K8s Ops Server instance
 */
export const k8sOpsServer = createK8sOpsServer();

// Export tools for direct access
export {
  getClusterSnapshotTool,
  analyzeCostOptimizationTool,
  detectZombieWorkloadsTool,
  analyzeIstioTrafficTool,
};
