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

// Placeholder for Neurolink type until SDK is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Neurolink = any;

/**
 * Register the K8s Ops Server with Neurolink
 *
 * Note: This requires the Neurolink SDK to be installed.
 * Currently a stub implementation that logs the configuration.
 */
export async function registerWithNeurolink(
  neurolink: Neurolink
): Promise<void> {
  const config = getNeuroLinkServerConfig();

  // When Neurolink SDK is available:
  // await neurolink.addInMemoryMCPServer("k8s-ops", config);

  // For now, just verify the neurolink object exists
  if (neurolink && typeof neurolink.addInMemoryMCPServer === "function") {
    await neurolink.addInMemoryMCPServer("k8s-ops", config);
    console.log("K8s Ops Server registered with Neurolink");
  } else {
    console.log(
      "Neurolink SDK not fully available. Server config prepared:",
      JSON.stringify(config, null, 2)
    );
  }
}
