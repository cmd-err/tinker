# K8s Ops Agent - MVP Documentation

## What is K8s Ops Agent?

K8s Ops Agent is a Kubernetes operations assistant that helps you:

- **Optimize costs** by identifying underutilized resources
- **Find zombie workloads** that are stuck, failing, or abandoned
- **Analyze Istio traffic** configurations for misconfigurations

It integrates with **Neurolink** via the Model Context Protocol (MCP), enabling natural language interactions with your cluster.

## Quick Start (5 minutes)

### Prerequisites

- Node.js 18+
- Access to a Kubernetes cluster (kubeconfig)
- npm or pnpm

### Installation

```bash
cd k8s-ops-agent
npm install
npm run build
```

### Test It

```bash
# Run against your cluster
npm run dev:snapshot

# See full JSON output
FULL_OUTPUT=true npm run dev:snapshot
```

## MVP Features

### 1. Cluster Snapshot (`get-cluster-snapshot`)

**What it does**: Fetches a comprehensive view of your cluster state.

**Use cases**:
- Get an overview of cluster resources
- Feed data into analysis tools
- Audit cluster composition

**Example**:
```typescript
const result = await k8sOpsServer.executeTool(
  'get-cluster-snapshot',
  { 
    includeIstio: true,
    includeSystemNamespaces: false 
  },
  { k8sMode: 'kubeconfig' }
);

// result.data contains:
// - nodes: Array of node info
// - namespaces: Array of namespace summaries
// - workloads: Deployments, StatefulSets, DaemonSets
// - pods: All pods with status
// - hpas: HorizontalPodAutoscalers
// - istio: VirtualServices, DestinationRules, Gateways
```

### 2. Cost Optimization (`analyze-cost-optimization`)

**What it does**: Identifies opportunities to reduce cluster costs.

**Detects**:
- ⚡ Underutilized nodes (< 30% resource usage)
- 📦 Overprovisioned workloads (limits >> requests)
- 🏚️ Idle namespaces (no running pods)
- 🔄 Scale-down opportunities

**Example**:
```typescript
const costAnalysis = await k8sOpsServer.executeTool(
  'analyze-cost-optimization',
  { 
    snapshot: clusterSnapshot,
    thresholds: {
      nodeUtilizationLow: 0.3,     // Flag nodes below 30%
      workloadOverprovisionRatio: 2 // Flag if limits > 2x requests
    },
    pricingConfig: {
      cpuCoreHourCost: 0.05,  // $0.05/core-hour
      memoryGiBHourCost: 0.01 // $0.01/GiB-hour
    }
  },
  { k8sMode: 'kubeconfig' }
);

// result.data contains:
// - summary: "Found 5 cost optimization opportunities..."
// - recommendations: Array of actionable recommendations
// - totalPotentialSavings: Estimated monthly savings
```

### 3. Zombie Detection (`detect-zombie-workloads`)

**What it does**: Finds workloads that are stuck, failing, or abandoned.

**Detects**:
- 💀 CrashLoopBackOff pods
- ⏳ Stuck Pending pods (> 24h)
- ❌ Failed pods
- 🖥️ NotReady nodes
- 📂 Empty/abandoned namespaces

**Example**:
```typescript
const zombies = await k8sOpsServer.executeTool(
  'detect-zombie-workloads',
  { 
    snapshot: clusterSnapshot,
    thresholds: {
      idleDaysThreshold: 7,          // Abandoned after 7 days
      crashLoopRestartThreshold: 5,   // After 5 restarts
      stuckPodHours: 24              // Pending > 24h
    }
  },
  { k8sMode: 'kubeconfig' }
);

// result.data contains:
// - summary: "Found 3 zombie workloads..."
// - zombieCount: 3
// - zombies: Array with details and suggested actions
```

### 4. Istio Traffic Analysis (`analyze-istio-traffic`)

**What it does**: Analyzes Istio configurations for issues.

**Detects**:
- 🎯 Unused subsets in DestinationRules
- ❓ Missing subsets referenced in VirtualServices
- 🔀 Stale mirror routes (forgot to remove after testing)
- ⚖️ Misconfigured route weights (not summing to 100)
- 🔒 Inconsistent mTLS settings

**Example**:
```typescript
const istioAnalysis = await k8sOpsServer.executeTool(
  'analyze-istio-traffic',
  { 
    snapshot: clusterSnapshot,
    options: {
      includeTopology: true, // Generate traffic graph
      checkMTLS: true        // Check mTLS consistency
    }
  },
  { k8sMode: 'kubeconfig' }
);

// result.data contains:
// - summary: "Analyzed 10 VirtualServices, found 2 issues..."
// - issues: Array of issues with severity and fixes
// - topology: Traffic graph (nodes and edges)
```

## Integration with Neurolink

### Register the Agent

```typescript
import { registerWithNeurolink } from '@cmd-err/k8s-ops-agent';

// Register with your Neurolink instance
await registerWithNeurolink(neurolinkInstance);
```

### Natural Language Examples

Once registered, you can ask questions like:

- "Show me the cluster overview"
- "Find any cost optimization opportunities"
- "Are there any zombie workloads in production?"
- "Check if my Istio configuration has any issues"

## Deployment Options

### Option 1: Local Development (kubeconfig)

```bash
# Uses ~/.kube/config automatically
npm run dev:snapshot
```

### Option 2: In-Cluster Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment
kubectl get pods -l app=k8s-ops-agent
```

Environment variables:
- `K8S_MODE=incluster` - Use in-cluster auth
- `PORT=3000` - HTTP server port

## API Reference

### HTTP Endpoints (when running server)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Server info |
| `/health` | GET | Health check |
| `/tools` | GET | List available tools |
| `/tools/:id` | GET | Get tool info |
| `/tools/:id/execute` | POST | Execute a tool |

### Tool Input Schemas

All inputs are validated with Zod schemas. Invalid input returns:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { ... }
  }
}
```

## Roadmap (Post-MVP)

- [ ] **Metrics Integration**: Pull actual usage from Prometheus/metrics-server
- [ ] **Alerting**: Send alerts for detected issues
- [ ] **Remediation**: Suggest kubectl commands or apply fixes
- [ ] **Multi-cluster**: Support for multiple clusters
- [ ] **Historical Analysis**: Track changes over time
- [ ] **Custom Rules**: User-defined analysis rules

## Troubleshooting

### "ECONNREFUSED" when connecting to cluster

Ensure your kubeconfig is valid:
```bash
kubectl cluster-info
```

### "Forbidden" errors

Check RBAC permissions. The agent needs read access to core resources and Istio CRDs.

### Istio resources not found

If Istio isn't installed, enable graceful handling:
```typescript
{ includeIstio: false }  // Skip Istio resources
```

## Support

- GitHub Issues: [cmd-err/tinker](https://github.com/cmd-err/tinker)
- Documentation: See `docs/ARCHITECTURE.md` for technical details
