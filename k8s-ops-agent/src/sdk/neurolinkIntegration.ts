/**
 * Neurolink Integration
 * Provides integration with Neurolink MCP framework
 */

import { k8sOpsServer, type K8sOpsServer } from "../mcp/k8sOpsServer.js";

/**
 * Get the K8s Ops Server instance for Neurolink integration
 */
export function getK8sOpsServer(): K8sOpsServer {
  return k8sOpsServer;
}

/**
 * Neurolink MCP server configuration format
 */
export interface NeurolinkMCPServerConfig {
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
 * Generate Neurolink-compatible server configuration
 */
export function getNeuroLinkServerConfig(): NeurolinkMCPServerConfig {
  const server = k8sOpsServer;

  return {
    server: {
      title: server.title,
      description: server.description,
      tools: server.tools.map((tool) => ({
        id: tool.id,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      })),
    },
    category: server.category,
    metadata: {
      version: server.version,
      author: "cmd-err",
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Example: Register with Neurolink
 *
 * This is a placeholder showing how to integrate with Neurolink.
 * Uncomment and adapt once Neurolink SDK is available.
 *
 * ```typescript
 * import { Neurolink } from "@juspay/neurolink";
 *
 * export async function registerWithNeurolink(neurolink: Neurolink): Promise<void> {
 *   const config = getNeuroLinkServerConfig();
 *
 *   await neurolink.addInMemoryMCPServer("k8s-ops", {
 *     server: config.server,
 *     category: config.category,
 *     metadata: config.metadata,
 *   });
 *
 *   console.log("K8s Ops Server registered with Neurolink");
 * }
 * ```
 */

/**
 * Neurolink interface - defines expected Neurolink SDK methods
 * Updated to match actual NeuroLink SDK from forked-neuro
 */
export interface Neurolink {
  addInMemoryMCPServer: (
    serverId: string,
    config: NeurolinkMCPServerConfig
  ) => Promise<void>;
  registerTools: (tools: Array<{ name: string; tool: any }>) => void;
}

/**
 * Register the K8s Ops Server with Neurolink
 *
 * Uses registerTools() method to match lighthouse pattern - this registers
 * tools as "custom" category which makes them available to providers.
 */
export async function registerWithNeurolink(
  neurolink: Neurolink
): Promise<void> {
  const server = k8sOpsServer;

  // Convert K8s tools to the format expected by registerTools()
  // This matches how lighthouse registers MCP tools (sessionInstanceManager.ts:1886)
  const toolsArray = server.tools.map((tool) => ({
    name: `k8s-ops_${tool.id}`,  // Prefix with server ID like lighthouse does
    tool: {
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute: async (params: unknown) => {
        // Call the tool's execute function with empty context
        // The context will be set via setToolContext() if needed
        return await tool.execute(params, {} as any);
      }
    }
  }));

  // Use registerTools() instead of addInMemoryMCPServer()
  // This registers tools as "custom" category, making them available to getCustomTools()
  if (neurolink && typeof neurolink.registerTools === "function") {
    neurolink.registerTools(toolsArray as any);
    console.log("✅ K8s Ops Server registered with Neurolink");
  } else {
    console.log(
      "⚠️  Neurolink SDK not fully available. Tools prepared:",
      toolsArray.map(t => t.name)
    );
  }
}
