/**
 * Core type definitions for the K8s Ops Agent
 */

// ============ Tool Execution Types ============

/**
 * Context passed to tool execution
 */
export interface ToolExecutionContext {
  /** The current Kubernetes mode (kubeconfig or incluster) */
  k8sMode: "kubeconfig" | "incluster";
  /** Optional timeout in milliseconds */
  timeout?: number;
  /** Optional logger function */
  logger?: (message: string) => void;

  // Session Management (Phase 1)
  /** Session ID for tracking investigation continuity */
  sessionId?: string;
  /** User identifier */
  userId?: string;
  /** Session manager instance for recursive investigations */
  sessionManager?: any; // Will be typed as SessionManager when imported

  /** Shared snapshot store to avoid passing large data between tool calls */
  snapshotStore?: Map<string, ClusterSnapshot>;

  // Investigation Context (simplified in-memory context)
  investigation?: {
    /** Investigation goal/question */
    goal: string;
    /** Snapshot store for sharing cluster state between tools */
    snapshotStore: Map<string, any>;
    /** Accumulated findings */
    findings: Array<{
      title: string;
      description: string;
      severity: "critical" | "high" | "medium" | "low" | "info";
      category: string;
      suggestedAction?: string;
      evidence?: Record<string, unknown>;
    }>;
    /** Investigation breadcrumbs (trail of steps taken) */
    breadcrumbs: string[];
    /** Method to add a finding */
    addFinding?: (finding: any) => void;
    /** Method to add a breadcrumb */
    addBreadcrumb?: (step: string | { action: string; result?: string; timestamp?: Date }) => void;
  };
}

/**
 * Result returned from tool execution
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    executionTimeMs: number;
    warnings?: string[];
  };
}

/**
 * Definition of an MCP-style tool
 */
export interface K8sOpsTool<TInput = unknown, TOutput = unknown> {
  id: string;
  title: string;
  description: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  execute: (
    input: TInput,
    context: ToolExecutionContext
  ) => Promise<ToolResult<TOutput>>;
}

// ============ Cluster Snapshot Types ============

/**
 * Node condition
 */
export interface NodeCondition {
  type: string;
  status: string;
  reason?: string;
}

/**
 * Node information in cluster snapshot
 */
export interface NodeInfo {
  name: string;
  labels: Record<string, string>;
  capacity: {
    cpu: string;
    memory: string;
    pods: string;
  };
  allocatable: {
    cpu: string;
    memory: string;
    pods: string;
  };
  conditions: NodeCondition[];
  usage?: {
    cpu?: string;
    memory?: string;
  };
}

/**
 * Container resource specification
 */
export interface ContainerResources {
  name: string;
  requests?: {
    cpu?: string;
    memory?: string;
  };
  limits?: {
    cpu?: string;
    memory?: string;
  };
}

/**
 * Workload information (Deployment, StatefulSet, DaemonSet)
 */
export interface WorkloadInfo {
  kind: "Deployment" | "StatefulSet" | "DaemonSet";
  name: string;
  namespace: string;
  replicas: {
    desired: number;
    ready: number;
    available: number;
  };
  containers: ContainerResources[];
  labels?: Record<string, string>;
  creationTimestamp?: string;
}

/**
 * Pod condition
 */
export interface PodCondition {
  type: string;
  status: string;
  lastTransitionTime?: string;
}

/**
 * Pod information
 */
export interface PodInfo {
  name: string;
  namespace: string;
  nodeName?: string;
  phase: string;
  conditions: PodCondition[];
  restartCount: number;
  containers: PodContainerStatus[];
  ownerRef?: {
    kind: string;
    name: string;
  };
  creationTimestamp?: string;
}

/**
 * Pod container status
 */
export interface PodContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  state?: string;
}

/**
 * HorizontalPodAutoscaler information
 */
export interface HPAInfo {
  name: string;
  namespace: string;
  targetRef: {
    kind: string;
    name: string;
  };
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  desiredReplicas: number;
  metrics?: {
    type: string;
    name?: string;
    currentValue?: string;
    targetValue?: string;
  }[];
}

/**
 * Namespace summary
 */
export interface NamespaceSummary {
  name: string;
  status: string;
  labels?: Record<string, string>;
  podCount: number;
  workloadCount: number;
  creationTimestamp?: string;
}

// ============ Istio Types ============

/**
 * VirtualService route destination
 */
export interface IstioRouteDestination {
  host: string;
  subset?: string;
  port?: number;
  weight?: number;
}

/**
 * VirtualService HTTP route
 */
export interface IstioHTTPRoute {
  match?: {
    uri?: { exact?: string; prefix?: string; regex?: string };
    headers?: Record<string, { exact?: string; prefix?: string; regex?: string }>;
  }[];
  route?: IstioRouteDestination[];
  mirror?: IstioRouteDestination;
  timeout?: string;
  retries?: {
    attempts: number;
    perTryTimeout?: string;
  };
}

/**
 * VirtualService information
 */
export interface VirtualServiceInfo {
  name: string;
  namespace: string;
  hosts: string[];
  gateways?: string[];
  http?: IstioHTTPRoute[];
  tcp?: {
    match?: unknown[];
    route?: IstioRouteDestination[];
  }[];
  raw?: unknown;
}

/**
 * DestinationRule subset
 */
export interface DestinationRuleSubset {
  name: string;
  labels: Record<string, string>;
  trafficPolicy?: unknown;
}

/**
 * DestinationRule information
 */
export interface DestinationRuleInfo {
  name: string;
  namespace: string;
  host: string;
  subsets?: DestinationRuleSubset[];
  trafficPolicy?: {
    connectionPool?: unknown;
    loadBalancer?: unknown;
    tls?: {
      mode?: string;
    };
  };
  raw?: unknown;
}

/**
 * Gateway server
 */
export interface GatewayServer {
  port: {
    number: number;
    name: string;
    protocol: string;
  };
  hosts: string[];
  tls?: {
    mode?: string;
    credentialName?: string;
  };
}

/**
 * Gateway information
 */
export interface GatewayInfo {
  name: string;
  namespace: string;
  servers: GatewayServer[];
  raw?: unknown;
}

/**
 * Complete cluster snapshot
 */
export interface ClusterSnapshot {
  timestamp: string;
  nodes: NodeInfo[];
  namespaces: NamespaceSummary[];
  workloads: WorkloadInfo[];
  pods: PodInfo[];
  hpas: HPAInfo[];
  istio?: {
    virtualServices: VirtualServiceInfo[];
    destinationRules: DestinationRuleInfo[];
    gateways: GatewayInfo[];
  };
}

// ============ Cost Optimization Types ============

/**
 * Cost optimization recommendation
 */
export interface CostRecommendation {
  id: string;
  type:
    | "overprovision"
    | "underutilized-node"
    | "idle-namespace"
    | "right-size"
    | "scale-down"
    | "remove-unused";
  severity: "low" | "medium" | "high";
  targetRef: {
    kind: string;
    name: string;
    namespace?: string;
  };
  description: string;
  potentialSavings?: {
    cpuCoreHours?: number;
    memoryGiBHours?: number;
    estimatedMonthlyCost?: number;
  };
  suggestedAction: string;
}

/**
 * Cost analysis result
 */
export interface CostAnalysisResult {
  summary: string;
  totalPotentialSavings?: {
    cpuCoreHours: number;
    memoryGiBHours: number;
    estimatedMonthlyCost?: number;
  };
  recommendations: CostRecommendation[];
  analyzedAt: string;
}

// ============ Zombie Workload Types ============

/**
 * Zombie workload detection result
 */
export interface ZombieWorkload {
  id: string;
  kind: "Pod" | "Node" | "Namespace" | "Deployment" | "StatefulSet" | "DaemonSet";
  name: string;
  namespace?: string;
  reason: string;
  severity: "low" | "medium" | "high";
  suggestedAction: string;
  lastActivityTime?: string;
  details?: Record<string, unknown>;
}

/**
 * Zombie detection result
 */
export interface ZombieDetectionResult {
  summary: string;
  zombieCount: number;
  zombies: ZombieWorkload[];
  analyzedAt: string;
}

// ============ Istio Traffic Analysis Types ============

/**
 * Istio topology issue
 */
export interface IstioTopologyIssue {
  id: string;
  type:
    | "unused-subset"
    | "missing-subset"
    | "orphan-virtual-service"
    | "orphan-destination-rule"
    | "stale-mirror"
    | "inconsistent-mtls"
    | "misconfigured-route";
  severity: "low" | "medium" | "high";
  description: string;
  relatedResources: {
    kind: string;
    name: string;
    namespace: string;
  }[];
  suggestedFix?: string;
}

/**
 * Traffic graph node
 */
export interface TrafficGraphNode {
  id: string;
  type: "service" | "gateway" | "external";
  name: string;
  namespace?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Traffic graph edge
 */
export interface TrafficGraphEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;
  subset?: string;
  isMirror?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Istio traffic topology
 */
export interface IstioTopology {
  nodes: TrafficGraphNode[];
  edges: TrafficGraphEdge[];
}

/**
 * Istio traffic analysis result
 */
export interface IstioTrafficAnalysisResult {
  summary: string;
  issueCount: number;
  issues: IstioTopologyIssue[];
  topology?: IstioTopology;
  analyzedAt: string;
}
