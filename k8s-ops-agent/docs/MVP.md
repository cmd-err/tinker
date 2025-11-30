# K8s Ops Agent - MVP Documentation

## What is K8s Ops Agent?

K8s Ops Agent is a **Kubernetes operations AI agent** that:

- **Orchestrates** multiple analysis tools based on your intent
- **Summarizes** findings into actionable insights
- **Optimizes costs** by identifying underutilized resources
- **Finds zombie workloads** that are stuck, failing, or abandoned
- **Analyzes Istio traffic** configurations for misconfigurations

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

### Test the Agent

```bash
# Run full cluster report (recommended)
npm run dev:agent:full

# Or specific analyses:
npm run dev:agent:health   # Health check only
npm run dev:agent:cost     # Cost optimization
npm run dev:agent:zombies  # Zombie detection
npm run dev:agent:istio    # Istio analysis
```

## Agent vs Tools

The K8s Ops Agent has two layers:

| Layer | What it is | When to use |
|-------|-----------|-------------|
| **Agent** | Orchestration layer that plans, executes, and summarizes | High-level intents like "analyze my cluster" |
| **Tools** | Individual functions that do one thing | Direct API access, building custom workflows |

### Using the Agent (Recommended)

```typescript
import { K8sOpsAgent } from '@cmd-err/k8s-ops-agent';

// Create agent
const agent = new K8sOpsAgent({
  k8sMode: 'kubeconfig',
  verbose: true,
});

// Run a full cluster report
const result = await agent.run({
  intent: 'full-cluster-report',
  includeIstio: true,
});

// Get the summary
console.log(result.summary.headline);
// "⚠️ Cluster needs attention: 3 high-priority issues found"

console.log(result.summary.narrative);
// "Analyzed cluster with 5 nodes and 47 pods. Found 2 zombie workloads..."

// Get actionable findings
for (const finding of result.findings) {
  console.log(`[${finding.severity}] ${finding.title}`);
  console.log(`  → ${finding.suggestedAction}`);
}
```

### Available Intents

| Intent | Tools Called | Use Case |
|--------|-------------|----------|
| `cluster-health-check` | snapshot → zombies | Quick health status |
| `cost-optimization` | snapshot → cost analysis | Find savings |
| `zombie-detection` | snapshot → zombie detection | Find stuck workloads |
| `istio-analysis` | snapshot → istio analysis | Check traffic config |
| `full-cluster-report` | snapshot → all analyses | Complete audit |

## MVP Features

### 1. Full Cluster Report

**What it does**: Runs all analyses and generates a comprehensive summary.

```typescript
const agent = new K8sOpsAgent({ k8sMode: 'kubeconfig' });
const result = await agent.run({ intent: 'full-cluster-report' });

// Summary includes:
// - healthScore (0-100)
// - healthStatus ('healthy' | 'warning' | 'critical')
// - topPriorities (top 3 issues)
// - potentialMonthlySavings
// - narrative (human-readable summary)
```

### 2. Agent Findings

All issues are normalized into findings with:

```typescript
interface AgentFinding {
  id: string;
  category: 'cost' | 'health' | 'zombie' | 'istio';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  resource?: { kind: string; name: string; namespace?: string };
  suggestedAction?: string;
  impact?: string;  // e.g., "~$50/month"
}
```

### 3. Progress Events

Track agent progress in real-time:

```typescript
agent.onEvent((event) => {
  if (event.type === 'step-completed') {
    console.log(`✅ ${event.data.message}`);
  }
});
```

## Using Tools Directly

For lower-level access, use the MCP server directly:

```typescript
import { k8sOpsServer } from '@cmd-err/k8s-ops-agent';

// Get cluster snapshot
const snapshot = await k8sOpsServer.executeTool(
  'get-cluster-snapshot',
  { includeIstio: true },
  { k8sMode: 'kubeconfig' }
);

// Run specific analysis
const zombies = await k8sOpsServer.executeTool(
  'detect-zombie-workloads',
  { snapshot: snapshot.data },
  { k8sMode: 'kubeconfig' }
);
```

## Integration with Neurolink

### Register the Agent

```typescript
import { registerWithNeurolink } from '@cmd-err/k8s-ops-agent';

// Register with your Neurolink instance
await registerWithNeurolink(neurolinkInstance);
```

### Use the Agent Class

```typescript
import { K8sOpsAgent } from '@cmd-err/k8s-ops-agent';

// The agent can be exposed to Neurolink for LLM orchestration
const agent = new K8sOpsAgent({ k8sMode: 'incluster' });

// Neurolink can call agent.run() with different intents
// based on user's natural language requests
```

## Deployment Options

### Option 1: Local Development (kubeconfig)

```bash
# Uses ~/.kube/config automatically
npm run dev:agent:full
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

## Example Output

```
🤖 K8s Ops Agent Demo
============================================================

📡 Kubernetes Mode: kubeconfig

🎯 Running intent: full-cluster-report

🔄 Running get-cluster-snapshot...
   ✅ get-cluster-snapshot completed in 1234ms
🔄 Running analyze-cost-optimization...
   ✅ analyze-cost-optimization completed in 56ms
🔄 Running detect-zombie-workloads...
   ✅ detect-zombie-workloads completed in 23ms
🔄 Running analyze-istio-traffic...
   ✅ analyze-istio-traffic completed in 12ms

============================================================
📊 AGENT RESULTS
============================================================

⚠️ Cluster needs attention: 2 high-priority issues found

📈 Health Score: 72/100 (warning)

📊 Statistics:
   Nodes: 3/3 healthy
   Pods: 45/47 running
   Zombies: 2
   Cost Issues: 3
   Istio Issues: 1

💰 Potential Monthly Savings: $127.50

🎯 Top Priorities:
   1. overprovision: api-server
   2. Zombie Pod: stuck-job-abc123
   3. unused-subset: canary

📝 Narrative:
Analyzed cluster with 3 nodes and 47 pods across 5 namespaces.
2 pod(s) are not running properly. Found 2 zombie workload(s)
that should be investigated. Identified 3 cost optimization
opportunities with potential savings of ~$127.50/month.
```

## Troubleshooting

### "ECONNREFUSED" when connecting to cluster

Ensure your kubeconfig is valid:
```bash
kubectl cluster-info
```

### "Forbidden" errors

Check RBAC permissions. The agent needs read access to core resources and Istio CRDs.

### Istio resources not found

If Istio isn't installed, the agent handles this gracefully and skips Istio analysis.

## Support

- GitHub Issues: [cmd-err/tinker](https://github.com/cmd-err/tinker)
- Documentation: See `docs/ARCHITECTURE.md` for technical details
