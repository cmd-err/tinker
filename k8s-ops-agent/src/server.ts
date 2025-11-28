/**
 * HTTP Server for K8s Ops Agent
 * Exposes MCP tools via HTTP endpoints for in-cluster deployment
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { k8sOpsServer } from "./mcp/k8sOpsServer.js";
import { getK8sMode } from "./mcp/k8sClient.js";
import type { ToolExecutionContext } from "./types.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

/**
 * Parse JSON body from request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error}`));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * Handle tool execution request
 */
async function handleToolExecution(
  toolId: string,
  body: unknown,
  res: ServerResponse
): Promise<void> {
  const context: ToolExecutionContext = {
    k8sMode: getK8sMode(),
    timeout: 60000,
    logger: (msg: string) => console.log(`[${toolId}] ${msg}`),
  };

  const result = await k8sOpsServer.executeTool(
    toolId,
    body as Record<string, unknown>,
    context
  );

  sendJson(res, result.success ? 200 : 500, result);
}

/**
 * Request handler
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  console.log(`${method} ${path}`);

  try {
    // Health check
    if (path === "/health" && method === "GET") {
      sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
      return;
    }

    // List tools
    if (path === "/tools" && method === "GET") {
      const tools = k8sOpsServer.tools.map((t: { id: string; title: string; description: string }) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      }));
      sendJson(res, 200, { tools });
      return;
    }

    // Get tool info
    const toolInfoMatch = path.match(/^\/tools\/([^/]+)$/);
    if (toolInfoMatch && method === "GET") {
      const tool = k8sOpsServer.getTool(toolInfoMatch[1]);
      if (tool) {
        sendJson(res, 200, {
          id: tool.id,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      } else {
        sendJson(res, 404, { error: "Tool not found" });
      }
      return;
    }

    // Execute tool
    const executeMatch = path.match(/^\/tools\/([^/]+)\/execute$/);
    if (executeMatch && method === "POST") {
      const body = await parseBody(req);
      await handleToolExecution(executeMatch[1], body, res);
      return;
    }

    // Server info
    if (path === "/" && method === "GET") {
      sendJson(res, 200, {
        id: k8sOpsServer.id,
        title: k8sOpsServer.title,
        description: k8sOpsServer.description,
        version: k8sOpsServer.version,
        category: k8sOpsServer.category,
        toolCount: k8sOpsServer.tools.length,
        endpoints: {
          health: "GET /health",
          tools: "GET /tools",
          toolInfo: "GET /tools/:toolId",
          execute: "POST /tools/:toolId/execute",
        },
      });
      return;
    }

    // Not found
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Request error:", error);
    sendJson(res, 500, {
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start the HTTP server
 */
function startServer(): void {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error("Unhandled error:", error);
      sendJson(res, 500, { error: "Internal server error" });
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`🚀 K8s Ops Agent HTTP Server`);
    console.log(`   Listening on http://${HOST}:${PORT}`);
    console.log(`   Mode: ${getK8sMode()}`);
    console.log(`   Tools: ${k8sOpsServer.listToolIds().join(", ")}`);
    console.log("");
    console.log(`   Endpoints:`);
    console.log(`     GET  /health              - Health check`);
    console.log(`     GET  /tools               - List tools`);
    console.log(`     GET  /tools/:id           - Get tool info`);
    console.log(`     POST /tools/:id/execute   - Execute tool`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down...");
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down...");
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
}

startServer();
