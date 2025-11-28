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

// Export Neurolink integration
export {
  getK8sOpsServer,
  getNeuroLinkServerConfig,
  registerWithNeurolink,
  type NeurolinkMCPServerConfig,
  type Neurolink,
} from "./sdk/neurolinkIntegration.js";
