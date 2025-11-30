# Neurolink K8s Ops Demo - Senior SRE Investigation Agent

This demo showcases a comprehensive Kubernetes operations agent that performs **Senior SRE-level investigations** using Neurolink SDK with MCP (Model Context Protocol) integration.

## ✅ What's Implemented

### 1. **Core K8s Operations Tools** (5 tools)
- `get-cluster-snapshot` - Get current cluster state (nodes, pods, services, etc.)
- `analyze-cost-optimization` - Find underutilized resources and cost savings
- `detect-zombie-workloads` - Find crash-looping pods, failed jobs, orphaned resources
- `analyze-istio-traffic` - Check service mesh VirtualServices and DestinationRules
- `investigate-deeper` - Multi-step recursive investigation with hypothesis testing

### 2. **Grafana MCP Server Integration** (56 tools) ✅ CONNECTED
The official Grafana MCP server (https://github.com/grafana/mcp-grafana) is successfully integrated, providing:

#### **Prometheus Metrics** (Historical Time-Series Data)
- `query_prometheus` - Query PromQL for metrics over time
- `list_prometheus_metric_names` - Discover available metrics
- `list_prometheus_label_names` - Get metric dimensions
- `list_prometheus_label_values` - Get label values for filtering

#### **Loki Logs** (Historical Log Data)
- `query_loki_logs` - Query LogQL for historical logs
- `query_loki_stats` - Get log volume statistics
- `list_loki_label_names` - Discover log labels
- `find_error_pattern_logs` - Find error patterns in logs
- `find_slow_requests` - Find slow request traces in logs

#### **Grafana Dashboards & Alerts**
- `search_dashboards` - Find relevant dashboards by query
- `get_dashboard_by_uid` - Get dashboard configuration
- `list_alert_rules` - List configured alert rules
- `get_alert_group` - Get alert group status
- `create_annotation` - Add annotations to time-series graphs

#### **Grafana Incidents & Oncall**
- `list_incidents` - List active incidents
- `create_incident` - Create new incident for tracking
- `get_current_oncall_users` - Get current oncall engineers
- `list_oncall_schedules` - Get oncall rotation schedules

#### **Pyroscope Profiling** (Performance Analysis)
- `fetch_pyroscope_profile` - Get CPU/memory flame graphs
- `list_pyroscope_profile_types` - List available profile types

**Total Available Tools**: **61 tools** (5 K8s + 56 Grafana)

---

## 🚀 Quick Start

### Step 1: Prerequisites

#### Install mcp-grafana binary (already done ✅)
```bash
# Verify installation
~/bin/mcp-grafana --version
# Should output: v0.7.9
```

#### Set up Kubernetes access
```bash
# Make sure kubectl is configured
kubectl get nodes
```

### Step 2: Configure Environment

Create `.env` file from the template:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```bash
# ============================================
# Required: LLM Provider (Azure OpenAI recommended)
# ============================================
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=gpt-4o-automatic

LLM_PROVIDER=azure
LLM_MODEL=gpt-4o-automatic

# ============================================
# Optional: Grafana for Historical Data Analysis
# ============================================
# Enables temporal analysis for intermittent issues
GRAFANA_URL=http://54.227.16.148:3000
GRAFANA_API_KEY=YOUR_API
```

**Get your Azure OpenAI credentials:**
1. Go to https://portal.azure.com/
2. Create an Azure OpenAI resource
3. Deploy the `gpt-4o` model
4. Get API key and endpoint from "Keys and Endpoint" section

**Get your Grafana service account token** (optional):
1. Go to your Grafana instance
2. Navigate to: Administration → Service Accounts
3. Create a new service account with "Viewer" role
4. Generate a token

### Step 3: Build and Run

```bash
# Install dependencies (if not done)
npm install

# Build the TypeScript code
npm run build

# Run an investigation
npm start "Analyze cluster health and identify any issues"
```

---

## 🎯 What This Agent Can Do

### **Scenario 1: Current Cluster Analysis** (Works WITHOUT Grafana)
✅ Check overall cluster health
✅ Find cost optimization opportunities (underutilized nodes/pods)
✅ Detect zombie workloads (crash-looping, failed, orphaned)
✅ Analyze Istio routing configuration issues
✅ Multi-step investigations with hypothesis-driven reasoning

### **Scenario 2: Historical Data Analysis** (Requires Grafana)
✅ Investigate intermittent errors ("503 errors rarely")
✅ Analyze performance degradation ("service slow 2 hours ago")
✅ Find temporal patterns ("OOMKilled pods yesterday")
✅ Correlate metrics + logs + cluster events
✅ **Root cause analysis with confidence levels**

---

## 📊 Example Investigations

### Example 1: Basic Cluster Health Check (No Grafana needed)
```bash
npm start "Analyze cluster health"
```

**What the agent does:**
1. Gets cluster snapshot (nodes, pods, services)
2. Checks for cost optimization opportunities
3. Detects zombie workloads (failed/crash-looping pods)
4. Analyzes Istio routing issues
5. Provides structured findings with severity levels

**Sample Output:**
```
🧠 ANALYSIS STARTED: Cluster Health Check

✓ Calling get-cluster-snapshot...
✓ Found: 3 nodes, 47 pods, 12 services

✓ Calling analyze-cost-optimization...
✓ Found: 2 underutilized nodes (avg CPU 12%)

✓ Calling detect-zombie-workloads...
✓ Found: 1 crash-looping pod (restart count: 42)

📋 FINDINGS:
1. [HIGH] Node over-provisioned - 2 nodes underutilized
   → Consider right-sizing or scaling down
2. [MEDIUM] Crash-looping pod: api-worker-abc123
   → Check logs for startup errors
```

### Example 2: Intermittent Error Investigation (Requires Grafana)
```bash
npm start "Getting 503 errors for api/analytics very rarely, analyze why"
```

**What the agent does:**
1. **Forms hypotheses** based on symptom ("rarely" = intermittent)
2. **Queries Prometheus** for 503 error rate over last 24h
3. **Queries Loki logs** for envoy access logs during error spikes
4. **Checks VirtualService/DestinationRule** configuration
5. **Correlates evidence** to identify root cause
6. **Provides fix** with confidence level

**Sample Output:**
```
🧠 UNDERSTANDING THE PROBLEM:
Problem type: INTERMITTENT SERVICE UNAVAILABILITY
- Symptom: 503 errors (not constant, rare)
- Impact: Specific endpoint (api/analytics)
- Known facts: Ingress healthy, backend pods healthy

🧠 HYPOTHESES (ranked by probability):
1. [70%] Istio misconfiguration - routing to non-existent upstream
   Evidence needed: Check VirtualService/DestinationRule for subset mismatches
2. [20%] Temporary pod unavailability during rolling updates
   Evidence needed: Check recent deployments, pod events
3. [10%] Circuit breaker triggering
   Evidence needed: Check envoy stats for circuit breaker metrics

🧠 INVESTIGATION:
Testing Hypothesis 1...

→ Querying Prometheus: sum(rate(istio_requests_total{response_code="503"}[5m]))
  Observation: 503 errors spike at ~0.1 req/s every 2-3 hours
  Analysis: Confirms intermittent nature

→ Querying Loki: {namespace="breeze"} |= "503" |= "api-analytics"
  Observation: Envoy logs show "NO_HEALTHY_UPSTREAM for subset v2"
  Analysis: Traffic being routed to non-existent subset

→ Checking VirtualService config via get-cluster-snapshot
  Observation: VirtualService routes 50% traffic to subset "v2"
               DestinationRule only defines subset "v1"
  Analysis: CONFIRMED - subset mismatch

🎯 ROOT CAUSE IDENTIFIED:
Cause: VirtualService 'api-analytics-vs' routes traffic to undefined subset 'v2'
Evidence:
  ✓ 503 errors correlate with traffic to 'v2' subset (Prometheus)
  ✓ Envoy returns NO_HEALTHY_UPSTREAM when routing to 'v2' (Loki logs)
  ✓ DestinationRule missing 'v2' subset definition (K8s snapshot)
Causal chain: Request → VirtualService routes 50% to 'v2' → Subset not found → Envoy 503
Confidence: 95%

🔧 RECOMMENDED FIX:
Option 1 (Preferred): Add missing 'v2' subset to DestinationRule
  kubectl patch destinationrule api-analytics-dr --type=json \
    -p '[{"op":"add","path":"/spec/subsets/-","value":{"name":"v2","labels":{"version":"v2"}}}]'

Option 2: Remove 'v2' route from VirtualService if not needed
  kubectl patch virtualservice api-analytics-vs --type=json \
    -p '[{"op":"remove","path":"/spec/http/0/route/1"}]'

Verification steps:
1. Apply fix
2. Check envoy stats: kubectl exec <pod> -c istio-proxy -- \
     curl localhost:15000/stats | grep no_healthy_upstream
   Expected: Counter should stop increasing
3. Monitor 503 rate in Prometheus
   Expected: Should drop to zero within 5 minutes
```

### Example 3: Performance Degradation (Requires Grafana)
```bash
npm start "Service payments latency increased 2 hours ago, why?"
```

**What the agent does:**
1. Queries Prometheus for latency p95/p99 metrics
2. Identifies exact time when degradation started
3. Checks for resource saturation (CPU, memory, network)
4. Analyzes recent deployments/config changes
5. Provides root cause with timeline

### Example 4: Resource Exhaustion (Requires Grafana)
```bash
npm start "Pods in namespace prod keep getting OOMKilled"
```

**What the agent does:**
1. Queries Prometheus for memory usage trends
2. Queries Loki for OOMKilled event logs
3. Compares resource limits vs actual usage
4. Identifies memory leak or under-provisioning
5. Recommends right-sizing

---

## 🧠 Senior SRE-Level Reasoning

This agent uses **hypothesis-driven investigation methodology**, mimicking how a Senior SRE would debug production issues:

### Investigation Pattern:
```
1. UNDERSTAND THE PROBLEM TYPE
   - Is it constant or intermittent?
   - Is it affecting all requests or specific patterns?
   - When did it start? What changed?

2. FORM HYPOTHESES
   - Based on symptoms, what are the 3-5 most likely causes?
   - For each hypothesis, what evidence would prove/disprove it?
   - Rank hypotheses by probability

3. GATHER TARGETED EVIDENCE
   - Don't run all tools blindly
   - Design specific tests to validate/refute hypotheses
   - Follow the evidence trail

4. REASON ABOUT EVIDENCE
   - What does this evidence tell me?
   - Does it support or refute my hypothesis?
   - What new hypotheses does it suggest?

5. VALIDATE ROOT CAUSE
   - Don't just guess - PROVE the root cause
   - Show the causal chain: A caused B caused C
   - Provide confidence level (0-100%)

6. RECOMMEND FIX WITH VERIFICATION
   - What specific action will fix this?
   - How can we verify the fix worked?
   - What monitoring should we add to prevent recurrence?
```

---

## 🔧 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Neurolink SDK                           │
│  (LLM Orchestration + MCP Tool Integration)                 │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
┌───────▼───────┐                   ┌──────────▼──────────┐
│  K8s Ops      │                   │  Grafana MCP Server │
│  Tools (5)    │                   │  (56 tools)         │
│               │                   │                     │
│ • snapshot    │                   │ • query_prometheus  │
│ • cost-opt    │                   │ • query_loki_logs   │
│ • zombies     │                   │ • search_dashboards │
│ • istio       │                   │ • list_incidents    │
│ • investigate │                   │ • fetch_profiles    │
└───────────────┘                   └─────────────────────┘
        │                                       │
        │                                       │
┌───────▼────────┐                  ┌──────────▼──────────┐
│  Kubernetes    │                  │  Observability      │
│  Cluster       │                  │  Backends           │
│  (kubectl API) │                  │  - Prometheus       │
└────────────────┘                  │  - Loki             │
                                    │  - Dashboards       │
                                    │  - Alerts           │
                                    │  - Pyroscope        │
                                    └─────────────────────┘
```

---

## 🐛 Troubleshooting

### Error: "spawn mcp-grafana ENOENT"
**Cause**: Binary not found in PATH
**Solution**: The binary is installed at `~/bin/mcp-grafana`. If you see this error, set:
```bash
export GRAFANA_MCP_COMMAND=~/bin/mcp-grafana
```

Or override in `.env`:
```bash
GRAFANA_MCP_COMMAND=/Users/harsh.tiwari/bin/mcp-grafana
```

### Error: "AZURE_OPENAI_API_KEY not set"
**Cause**: Missing LLM credentials
**Solution**: Create `.env` file with Azure OpenAI credentials:
```bash
cp .env.example .env
# Edit .env and add:
AZURE_OPENAI_API_KEY=your_actual_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
```

### Grafana tools not working
**Cause**: Grafana credentials not configured
**Solution**: Add to `.env`:
```bash
# Get service account token from: Grafana → Administration → Service Accounts
GRAFANA_URL=http://your-grafana-url:3000
GRAFANA_API_KEY=glsa_your_service_account_token_here
```

### Error: "Failed to create provider azure: ReferenceError: File is not defined"
**Cause**: Node.js version incompatibility (need v20+)
**Solution**: This is a warning, not a blocking error. The agent falls back to other providers.
**Fix**: Upgrade Node.js to v20+ or use a different provider (OpenAI, Anthropic)

---

## 📝 Implementation Details

### What Was Built (Phase 2 Implementation)

#### Files Modified:
1. **`src/index.ts`** (lines 87-164)
   - Added Grafana MCP server registration with graceful fallback
   - Uses official mcp-grafana binary from ~/bin/mcp-grafana
   - Connects Prometheus, Loki, Dashboards, Alerts, Incidents, Profiling

2. **`.env.example`**
   - Added comprehensive observability backend configuration
   - Documented Grafana service account token setup
   - Added quick start guide and capabilities comparison

3. **`package.json`**
   - Removed grafana-mcp-analyzer npm dependency (using Go binary instead)

#### Key Implementation:
```typescript
// Grafana MCP Server Registration (src/index.ts:97-116)
await neurolink.addExternalMCPServer("grafana", {
  id: "grafana",
  name: "grafana",
  description: "Official Grafana MCP server for Prometheus, Loki, dashboards, alerts",
  transport: "stdio" as const,
  status: "initializing" as const,
  tools: [],
  command: process.env.GRAFANA_MCP_COMMAND || `${process.env.HOME}/bin/mcp-grafana`,
  args: [],
  env: {
    GRAFANA_URL: process.env.GRAFANA_URL!,
    GRAFANA_SERVICE_ACCOUNT_TOKEN: process.env.GRAFANA_API_KEY!,
  },
});
```

### System Status

| Component | Status | Version | Notes |
|-----------|--------|---------|-------|
| K8s Ops Tools | ✅ Working | 1.0.0 | 5 tools registered |
| Grafana MCP Binary | ✅ Installed | v0.7.9 | ~/bin/mcp-grafana |
| Grafana MCP Server | ✅ Connected | v0.7.9 | 56 tools discovered |
| Total Tools Available | ✅ 61 tools | - | Ready for use |
| Azure OpenAI | ⚠️ Not configured | - | Set credentials in .env |
| Grafana Backend | ⚠️ Optional | - | Set for historical analysis |

---

## 🎓 Next Steps

### For Basic Cluster Analysis (No Grafana):
1. ✅ Configure Azure OpenAI credentials in `.env`
2. ✅ Run: `npm start "Analyze cluster health"`
3. ✅ Test cost optimization, zombie detection, Istio analysis

### For Advanced Historical Analysis (With Grafana):
1. ✅ Configure Grafana URL and service account token in `.env`
2. ✅ Verify Grafana connectivity: `curl $GRAFANA_URL/api/health`
3. ✅ Run: `npm start "Getting 503 errors rarely, why?"`
4. ✅ Test temporal analysis, log correlation, root cause identification

---

## 📚 Resources

- [Official Grafana MCP Server](https://github.com/grafana/mcp-grafana) - 56 tools for Prometheus, Loki, Dashboards
- [Neurolink SDK Documentation](https://github.com/juspay/neurolink) - LLM orchestration with MCP
- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification
- [PromQL Documentation](https://prometheus.io/docs/prometheus/latest/querying/basics/) - Prometheus queries
- [LogQL Documentation](https://grafana.com/docs/loki/latest/logql/) - Loki log queries
- [Plan Document](/.claude/plans/snuggly-tinkering-summit.md) - Full implementation plan with reasoning

---

## ✅ Phase 2 Complete

**Status**: Grafana MCP server successfully integrated with 56 tools
**Next Action**: Configure Azure OpenAI credentials to start investigating!

```bash
# Quick test (after setting AZURE_OPENAI_API_KEY):
npm run build && npm start "Analyze cluster health"
```
