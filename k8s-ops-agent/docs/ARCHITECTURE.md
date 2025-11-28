# K8s Ops Agent Architecture

## Overview

The K8s Ops Agent is a Kubernetes Cost & Traffic Operations **AI Agent** that integrates with Neurolink via the Model Context Protocol (MCP). It provides intelligent analysis capabilities for Kubernetes clusters including cost optimization, zombie workload detection, and Istio traffic analysis.

**Key Distinction:**
- **Agent Layer**: Orchestrates tools, plans workflows, generates summaries
- **MCP Server**: Exposes tools for direct access and Neurolink integration
- **Tools**: Individual analysis functions

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Neurolink / LLM                                │
│                         (Natural Language Interface)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Natural Language
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          K8s Ops Agent Layer                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    K8sOpsAgent (Orchestration)                        │  │
│  │  • Intent Planning     • Multi-tool Execution    • Error Recovery    │  │
│  │  • Result Aggregation  • Summary Generation      • Progress Events   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        MCP Server (Tool Registry)                    │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐ │  │
│  │  │   Cluster   │ │    Cost     │ │   Zombie    │ │     Istio       │ │  │
│  │  │  Snapshot   │ │Optimization │ │  Detection  │ │    Traffic      │ │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                      │                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                      Kubernetes Client Layer                         │  │
│  │              (kubeconfig / in-cluster authentication)                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │  Kubernetes   │ │    Istio      │ │   Metrics     │
            │   Core API    │ │    CRDs       │ │   (optional)  │
            └───────────────┘ └───────────────┘ └───────────────┘
```

## Component Details

### 1. Agent Layer (`src/agent/k8sOpsAgent.ts`)

The **K8sOpsAgent** is the orchestration layer that:

- **Plans Tool Execution**: Maps intents to tool sequences
- **Executes Workflows**: Runs tools in order, handles errors
- **Aggregates Results**: Combines findings from all tools
- **Generates Summaries**: Produces human-readable narratives
- **Emits Progress Events**: Real-time status updates

```typescript
class K8sOpsAgent {
  // Run an analysis workflow
  async run(request: AgentRequest): Promise<AgentResponse>;
  
  // Subscribe to progress events
  onEvent(handler: AgentEventHandler): void;
}

// Available intents
type AgentIntent =
  | "cluster-health-check"
  | "cost-optimization"
  | "zombie-detection"
  | "istio-analysis"
  | "full-cluster-report";
```

#### Intent → Tool Mapping

| Intent | Tools Executed |
|--------|---------------|
| `cluster-health-check` | snapshot → zombies |
| `cost-optimization` | snapshot → cost |
| `zombie-detection` | snapshot → zombies |
| `istio-analysis` | snapshot → istio |
| `full-cluster-report` | snapshot → cost → zombies → istio |

#### Agent Response Structure

```typescript
interface AgentResponse {
  success: boolean;
  intent: AgentIntent;
  totalDurationMs: number;
  steps: AgentStep[];        // Execution trace
  summary: AgentSummary;     // Executive summary
  findings: AgentFinding[];  // Normalized issues
  rawData?: {...};           // Optional raw tool outputs
}
```

### 2. MCP Server Layer (`src/mcp/k8sOpsServer.ts`)

The MCP Server exposes tools for:
- Direct API access
- Neurolink integration
- Custom workflow building

```typescript
interface K8sOpsServer {
  id: string;           // Server identifier
  title: string;        // Human-readable name
  tools: K8sOpsTool[];  // Available tools
  executeTool();        // Execute a tool by ID
  getTool();            // Get tool by ID
  listToolIds();        // List all tool IDs
}
```

### 3. Tool Layer (`src/mcp/tools/`)

Each tool follows the MCP tool interface:

```typescript
interface K8sOpsTool<TInput, TOutput> {
  id: string;           // Unique tool identifier
  title: string;        // Display name
  description: string;  // Tool description
  inputSchema: unknown; // Zod schema for input validation
  execute(): Promise<ToolResult<TOutput>>;
}
```

#### Available Tools

| Tool | Purpose | Input | Output |
|------|---------|-------|--------|
| `get-cluster-snapshot` | Fetch cluster state | Namespace filters, Istio flag | ClusterSnapshot |
| `analyze-cost-optimization` | Identify cost savings | Snapshot, thresholds | CostAnalysisResult |
| `detect-zombie-workloads` | Find zombie resources | Snapshot, thresholds | ZombieDetectionResult |
| `analyze-istio-traffic` | Analyze Istio config | Snapshot, options | IstioTrafficAnalysisResult |

### 3. Kubernetes Client Layer (`src/mcp/k8sClient.ts`)

Handles authentication and API communication:

```typescript
// Authentication modes
type K8sMode = "kubeconfig" | "incluster";

// API clients provided
interface K8sClients {
  kubeConfig: KubeConfig;
  coreV1Api: CoreV1Api;      // Nodes, Pods, Namespaces
  appsV1Api: AppsV1Api;      // Deployments, StatefulSets, DaemonSets
  autoscalingV2Api: AutoscalingV2Api;  // HPAs
  customObjectsApi: CustomObjectsApi;   // Istio CRDs
}
```

### 4. Neurolink Integration (`src/sdk/neurolinkIntegration.ts`)

Bridges the agent with Neurolink:

```typescript
// Register with Neurolink
async function registerWithNeurolink(neurolink: Neurolink): Promise<void>;

// Get server configuration for Neurolink
function getNeuroLinkServerConfig(): NeurolinkMCPServerConfig;
```

## Data Flow

### Tool Execution Flow

```
1. User/LLM Request
       │
       ▼
2. Neurolink routes to K8s Ops Server
       │
       ▼
3. Server validates input against Zod schema
       │
       ▼
4. Tool executes with K8s client
       │
       ▼
5. Results returned with metadata
       │
       ▼
6. Neurolink processes response
```

### Cluster Snapshot Flow

```
get-cluster-snapshot
       │
       ├──▶ List Nodes (CoreV1Api)
       │
       ├──▶ List Namespaces (CoreV1Api)
       │
       ├──▶ For each namespace:
       │    ├── List Pods
       │    ├── List Deployments
       │    ├── List StatefulSets
       │    ├── List DaemonSets
       │    └── List HPAs
       │
       └──▶ If includeIstio:
            ├── List VirtualServices
            ├── List DestinationRules
            └── List Gateways
```

## Type System

### Core Types Hierarchy

```
ClusterSnapshot
├── NodeInfo[]
│   └── NodeCondition[]
├── NamespaceSummary[]
├── WorkloadInfo[]
│   └── ContainerResources[]
├── PodInfo[]
│   ├── PodCondition[]
│   └── PodContainerStatus[]
├── HPAInfo[]
└── IstioResources (optional)
    ├── VirtualServiceInfo[]
    │   └── IstioHTTPRoute[]
    ├── DestinationRuleInfo[]
    │   └── DestinationRuleSubset[]
    └── GatewayInfo[]
        └── GatewayServer[]
```

### Analysis Output Types

```
CostAnalysisResult
└── CostRecommendation[]
    └── PotentialSavings

ZombieDetectionResult
└── ZombieWorkload[]

IstioTrafficAnalysisResult
├── IstioTopologyIssue[]
└── IstioTopology (optional)
    ├── TrafficGraphNode[]
    └── TrafficGraphEdge[]
```

## Deployment Architecture

### In-Cluster Deployment

```
┌────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   k8s-ops-agent Pod                   │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │              HTTP Server (:3000)                │  │  │
│  │  │  ┌─────────────────────────────────────────┐   │  │  │
│  │  │  │         K8s Ops MCP Server              │   │  │  │
│  │  │  └─────────────────────────────────────────┘   │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                         │                             │  │
│  │               ServiceAccount                          │  │
│  │                         │                             │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │              ClusterRole (read-only)           │  │  │
│  │  │  • nodes, pods, services                       │  │  │
│  │  │  • deployments, statefulsets, daemonsets       │  │  │
│  │  │  • horizontalpodautoscalers, namespaces        │  │  │
│  │  │  • virtualservices, destinationrules, gateways │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### RBAC Requirements

| Resource | API Group | Verbs |
|----------|-----------|-------|
| nodes | core | get, list, watch |
| pods | core | get, list, watch |
| services | core | get, list, watch |
| namespaces | core | get, list, watch |
| deployments | apps | get, list, watch |
| statefulsets | apps | get, list, watch |
| daemonsets | apps | get, list, watch |
| horizontalpodautoscalers | autoscaling | get, list, watch |
| virtualservices | networking.istio.io | get, list, watch |
| destinationrules | networking.istio.io | get, list, watch |
| gateways | networking.istio.io | get, list, watch |

## Security Considerations

1. **Read-Only Access**: The agent only requires read permissions; no write operations
2. **ServiceAccount Isolation**: Runs with dedicated ServiceAccount
3. **In-Cluster Auth**: Uses Kubernetes native authentication when deployed in-cluster
4. **No Secrets Storage**: Does not store any credentials; relies on K8s auth

## Extension Points

### Adding New Tools

1. Create tool file in `src/mcp/tools/`
2. Implement `K8sOpsTool` interface
3. Register in `k8sOpsServer.ts`
4. Export from `src/index.ts`

### Custom Analysis

Tools receive `ClusterSnapshot` and can implement custom analysis logic:

```typescript
const myTool: K8sOpsTool<MyInput, MyOutput> = {
  id: "my-custom-analysis",
  title: "My Custom Analysis",
  description: "Custom analysis description",
  inputSchema: MyInputSchema,
  execute: async (input, context) => {
    // Custom analysis logic
    return { success: true, data: result };
  },
};
```

## Performance Considerations

1. **Snapshot Caching**: Consider caching snapshots for repeated analysis
2. **Namespace Filtering**: Use namespace filters to reduce API calls
3. **Pagination**: K8s API responses may be paginated for large clusters
4. **Timeout Handling**: All operations support configurable timeouts
