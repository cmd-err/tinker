# K8s Ops Agent

A **Kubernetes Cost & Traffic Ops Agent** integrated with **Neurolink** via MCP (Model Context Protocol). This agent provides intelligent analysis of Kubernetes clusters for cost optimization, zombie workload detection, and Istio traffic analysis.

## Features

- **Cluster Snapshot** (`get-cluster-snapshot`): Fetch comprehensive cluster state including nodes, namespaces, workloads, pods, HPAs, and Istio resources.
- **Cost Optimization** (`analyze-cost-optimization`): Identify underutilized nodes, overprovisioned workloads, and idle namespaces.
- **Zombie Detection** (`detect-zombie-workloads`): Find crash-looping pods, failed workloads, unhealthy nodes, and abandoned resources.
- **Istio Traffic Analysis** (`analyze-istio-traffic`): Detect misconfigurations in VirtualServices, DestinationRules, and Gateways.

## Quick Start

### Prerequisites

- Node.js 18+
- A Kubernetes cluster (or kubeconfig for local development)
- (Optional) Istio installed for traffic analysis

### Installation

```bash
cd k8s-ops-agent
pnpm install
pnpm build
```

### Local Development

Run the test harness against your local kubeconfig:

```bash
# Build and run
pnpm build && pnpm dev:snapshot

# With full JSON output
FULL_OUTPUT=true pnpm dev:snapshot
```

## Project Structure

```
k8s-ops-agent/
├── src/
│   ├── index.ts                 # Main exports
│   ├── types.ts                 # Type definitions
│   ├── mcp/
│   │   ├── k8sOpsServer.ts      # MCP server abstraction
│   │   ├── k8sClient.ts         # Kubernetes client helper
│   │   └── tools/
│   │       ├── index.ts
│   │       ├── getClusterSnapshot.ts
│   │       ├── analyzeCostOptimization.ts
│   │       ├── detectZombieWorkloads.ts
│   │       └── analyzeIstioTraffic.ts
│   ├── sdk/
│   │   └── neurolinkIntegration.ts
│   └── dev/
│       └── runClusterSnapshot.ts
├── k8s/                         # Kubernetes manifests
├── package.json
├── tsconfig.json
└── README.md
```

## Tools Reference

### `get-cluster-snapshot`

Fetches a comprehensive snapshot of the Kubernetes cluster.

**Input:**
```typescript
{
  namespaces?: string[];         // Filter by namespaces (default: all)
  includeIstio?: boolean;        // Include Istio resources (default: true)
  includeSystemNamespaces?: boolean;  // Include kube-system etc (default: false)
}
```

**Output:** `ClusterSnapshot` containing nodes, namespaces, workloads, pods, HPAs, and Istio resources.

### `analyze-cost-optimization`

Analyzes cluster resources for cost optimization opportunities.

**Input:**
```typescript
{
  snapshot: ClusterSnapshot;     // From get-cluster-snapshot
  thresholds?: {
    nodeUtilizationLow?: number;      // Default: 0.3
    workloadOverprovisionRatio?: number;  // Default: 2
    idlePodThresholdHours?: number;   // Default: 24
  };
  pricingConfig?: {
    cpuCoreHourCost?: number;    // Default: 0.05
    memoryGiBHourCost?: number;  // Default: 0.01
  };
}
```

**Output:** `CostAnalysisResult` with recommendations and potential savings.

### `detect-zombie-workloads`

Identifies zombie workloads in the cluster.

**Input:**
```typescript
{
  snapshot: ClusterSnapshot;
  thresholds?: {
    idleDaysThreshold?: number;       // Default: 7
    crashLoopRestartThreshold?: number;  // Default: 5
    stuckPodHours?: number;           // Default: 24
  };
}
```

**Output:** `ZombieDetectionResult` with zombie workloads and severity ratings.

### `analyze-istio-traffic`

Analyzes Istio configurations for issues.

**Input:**
```typescript
{
  snapshot: ClusterSnapshot;     // Must include Istio resources
  options?: {
    includeTopology?: boolean;   // Default: true
    checkMTLS?: boolean;         // Default: true
  };
}
```

**Output:** `IstioTrafficAnalysisResult` with issues and optional traffic topology graph.

## Neurolink Integration

### Basic Usage

```typescript
import { getK8sOpsServer, registerWithNeurolink } from '@cmd-err/k8s-ops-agent';

// Get the server instance
const server = getK8sOpsServer();

// Register with Neurolink
await registerWithNeurolink(neurolinkInstance);
```

### Direct Tool Execution

```typescript
import { k8sOpsServer } from '@cmd-err/k8s-ops-agent';

const context = {
  k8sMode: 'kubeconfig',
  timeout: 30000,
};

// Execute a tool
const result = await k8sOpsServer.executeTool(
  'get-cluster-snapshot',
  { includeIstio: true },
  context
);
```

## In-Cluster Deployment

### Environment Variables

- `K8S_MODE`: Set to `incluster` for in-cluster deployment, or `kubeconfig` for local development.

### Kubernetes Manifests

Deploy using the manifests in `k8s/`:

```bash
kubectl apply -f k8s/
```

Required RBAC permissions:
- Read access to: `nodes`, `pods`, `services`, `deployments`, `statefulsets`, `daemonsets`, `horizontalpodautoscalers`, `namespaces`
- Read access to Istio CRDs: `virtualservices`, `destinationrules`, `gateways`

## Development

### Building

```bash
pnpm build
```

### Linting

```bash
pnpm lint
```

### Testing

```bash
pnpm test
```

## License

MIT
