# K8s Ops Agent

A **Kubernetes Cost & Traffic Ops AI Agent** integrated with **Neurolink** via MCP (Model Context Protocol). This agent provides intelligent analysis of Kubernetes clusters for cost optimization, zombie workload detection, and Istio traffic analysis.

## 🚀 What This Is

This is a **complete AI agent** that:
1. **Orchestrates** multiple analysis tools
2. **Reasons** about cluster state
3. **Generates** executive summaries and recommendations
4. **Integrates** with Neurolink for LLM-powered workflows

```
User: "What's wasting money in my cluster?"
         ↓
    [K8sOpsAgent] → plans tools → executes → aggregates
         ↓
    [Neurolink/LLM] → summarizes results
         ↓
User: "3 underutilized nodes found, ~$150/month savings possible"
```

## Features

- **🤖 Agent Layer**: Orchestrates multi-step analysis workflows
- **📊 Cluster Snapshot** (`get-cluster-snapshot`): Fetch comprehensive cluster state
- **💰 Cost Optimization** (`analyze-cost-optimization`): Find savings opportunities
- **🧟 Zombie Detection** (`detect-zombie-workloads`): Identify stuck/failed workloads
- **🌐 Istio Traffic Analysis** (`analyze-istio-traffic`): Detect misconfigurations
- **🔗 MCP Server**: Standard MCP interface for any MCP host
- **🔌 Neurolink Integration**: Full SDK integration with LLM summarization

## Quick Start

### Prerequisites

- Node.js 18+
- A Kubernetes cluster (or kubeconfig for local development)
- (Optional) Istio installed for traffic analysis
- (Optional) Neurolink SDK with API key for LLM features

### Installation

```bash
cd k8s-ops-agent
npm install
npm run build
```

### Run the Agent

```bash
# Full cluster report
npm run dev:agent:full

# Cost optimization analysis
npm run dev:agent:cost

# Zombie detection
npm run dev:agent:zombies

# Quick health check
npm run dev:agent:health
```

### Run with Neurolink

```bash
# Natural language queries
npm run dev:neurolink -- "What's wasting money in my cluster?"
npm run dev:neurolink -- "Find zombie workloads"
npm run dev:neurolink -- "Check the Istio configuration"
```

### Run as MCP Server

```bash
# Start the MCP server (stdio transport)
npm run start:mcp
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     K8sOpsNeurolinkAgent                        │
│  Natural Language → Intent → Orchestration → LLM Summary        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        K8sOpsAgent                              │
│  Intent Planning → Tool Execution → Result Aggregation          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server                                 │
│  Tool Discovery → Input Validation → Tool Routing               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Tools                                    │
│  get-cluster-snapshot | analyze-cost | detect-zombies | istio   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Kubernetes API                                │
│  Nodes | Pods | Deployments | HPAs | Istio CRDs                 │
└─────────────────────────────────────────────────────────────────┘
```

## Usage Examples

### 1. Agent (Recommended)

```typescript
import { K8sOpsAgent } from '@cmd-err/k8s-ops-agent';

const agent = new K8sOpsAgent({ k8sMode: 'kubeconfig' });

// Run full analysis
const result = await agent.run({ intent: 'full-cluster-report' });

console.log(result.summary.headline);
// "⚠️ Cluster needs attention: 3 high-priority issues found"

console.log(result.summary.healthScore);
// 72

console.log(result.findings.slice(0, 3));
// Top 3 findings with severity, description, and suggested actions
```

### 2. Neurolink Agent (with LLM)

```typescript
import { K8sOpsNeurolinkAgent } from '@cmd-err/k8s-ops-agent';
import { createBestAIProvider } from '@juspay/neurolink';

const agent = new K8sOpsNeurolinkAgent({
  k8sMode: 'kubeconfig',
  neurolink: { getProvider: () => createBestAIProvider() },
});

// Natural language query
const response = await agent.query("What's eating up resources in my cluster?");
console.log(response);
// Detailed, context-aware response from LLM
```

### 3. MCP Server (for any MCP host)

```typescript
// Use with Claude Desktop, Cursor, or any MCP host
// Configure in your MCP host settings:
{
  "mcpServers": {
    "k8s-ops": {
      "command": "node",
      "args": ["/path/to/k8s-ops-agent/dist/mcpServer.js"]
    }
  }
}
```

### 4. Direct Tool Execution

```typescript
import { k8sOpsServer } from '@cmd-err/k8s-ops-agent';

const context = { k8sMode: 'kubeconfig', timeout: 30000 };

const result = await k8sOpsServer.executeTool(
  'get-cluster-snapshot',
  { includeIstio: true },
  context
);
```

## Project Structure

```
k8s-ops-agent/
├── src/
│   ├── index.ts                 # Main exports
│   ├── types.ts                 # Type definitions
│   ├── mcpServer.ts             # MCP server (stdio transport)
│   ├── server.ts                # HTTP server for in-cluster
│   ├── agent/
│   │   ├── k8sOpsAgent.ts       # Agent orchestration
│   │   └── agentTypes.ts        # Agent type definitions
│   ├── mcp/
│   │   ├── k8sOpsServer.ts      # MCP server abstraction
│   │   ├── k8sClient.ts         # Kubernetes client
│   │   └── tools/               # Tool implementations
│   ├── sdk/
│   │   ├── neurolinkIntegration.ts  # Basic Neurolink integration
│   │   └── neurolinkAgent.ts    # Full Neurolink agent
│   └── dev/
│       ├── runAgent.ts          # Agent demo
│       └── runNeurolinkAgent.ts # Neurolink demo
├── k8s/                         # Kubernetes manifests
├── docs/
│   ├── MVP.md                   # Quick start guide
│   └── ARCHITECTURE.md          # System architecture
└── package.json
```

## Available Intents

| Intent | Description | Tools Used |
|--------|-------------|------------|
| `cluster-health-check` | Quick health status | snapshot → zombies |
| `cost-optimization` | Find savings | snapshot → cost |
| `zombie-detection` | Find stuck workloads | snapshot → zombies |
| `istio-analysis` | Check traffic config | snapshot → istio |
| `full-cluster-report` | Complete audit | snapshot → all |

## In-Cluster Deployment

```bash
# Deploy with RBAC
kubectl apply -f k8s/

# Or run the server
K8S_MODE=incluster npm run start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `K8S_MODE` | `kubeconfig` or `incluster` | `kubeconfig` |
| `PORT` | HTTP server port | `3000` |
| `GOOGLE_AI_API_KEY` | For Neurolink LLM | - |
| `OPENAI_API_KEY` | Alternative LLM provider | - |

## License

MIT
