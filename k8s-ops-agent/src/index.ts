/**
 * K8s Ops Agent
 * Kubernetes Cost & Traffic Ops Agent integrated with Neurolink via MCP
 */

// Export types
export * from "./types.js";

// Export MCP server
export {
  createK8sOpsServer,
  k8sOpsServer,
  type K8sOpsServer,
  type K8sOpsServerConfig,
} from "./mcp/k8sOpsServer.js";

// Export individual tools
export {
  getClusterSnapshotTool,
  GetClusterSnapshotInputSchema,
  type GetClusterSnapshotInput,
} from "./mcp/tools/getClusterSnapshot.js";

export {
  analyzeCostOptimizationTool,
  AnalyzeCostOptimizationInputSchema,
  type AnalyzeCostOptimizationInput,
} from "./mcp/tools/analyzeCostOptimization.js";

export {
  detectZombieWorkloadsTool,
  DetectZombieWorkloadsInputSchema,
  type DetectZombieWorkloadsInput,
} from "./mcp/tools/detectZombieWorkloads.js";

export {
  analyzeIstioTrafficTool,
  AnalyzeIstioTrafficInputSchema,
  type AnalyzeIstioTrafficInput,
} from "./mcp/tools/analyzeIstioTraffic.js";

// Export K8s client utilities
export {
  loadKubeConfig,
  createK8sClients,
  getK8sMode,
  type K8sMode,
  type K8sClients,
} from "./mcp/k8sClient.js";

// Export Neurolink integration (legacy)
export {
  getK8sOpsServer,
  getNeuroLinkServerConfig,
  type NeurolinkMCPServerConfig,
  type Neurolink,
} from "./sdk/neurolinkIntegration.js";

// Export Neurolink Agent (primary integration)
export {
  K8sOpsNeurolinkAgent,
  createK8sOpsNeurolinkAgent,
  registerK8sOpsWithNeurolink,
  registerWithNeurolink,
  type NeurolinkProvider,
  type NeuroLinkInstance,
  type MCPServerInfo,
  type MCPToolDefinition,
} from "./sdk/neurolinkAgent.js";

// Export Agent (orchestration layer)
export {
  K8sOpsAgent,
  createK8sOpsAgent,
  quickHealthCheck,
  fullClusterReport,
  analyzeCosts,
  findZombies,
  type AgentIntent,
  type AgentRequest,
  type AgentResponse,
  type AgentConfig,
  type AgentStep,
  type AgentFinding,
  type AgentSummary,
  type AgentEvent,
  type AgentEventType,
  type AgentEventHandler,
} from "./agent/index.js";
