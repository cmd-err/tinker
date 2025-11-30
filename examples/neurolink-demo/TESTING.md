# K8s Ops Agent - Testing Guide

## ⚠️ IMPORTANT: Mandatory Recursion Enabled

**Phase 0 Fix Applied**: The agent now **automatically** investigates issues without asking for permission.

When the agent finds:
- High CPU/memory (>80%)
- Failed/crash-looping pods
- Istio misconfigurations
- Cost waste >$100/month
- Any critical/high severity finding

It will **IMMEDIATELY** spawn a sub-investigation (using `investigate-deeper` tool) WITHOUT asking you first.

## Quick Start

The demo **requires** a query as a command-line argument:

```bash
npm start "your investigation query here"
```

## Example Commands

### 1. Basic Health Check (May Trigger Recursion)
```bash
npm start "What is the overall health of my cluster?"
```
**Expected**:
- Uses core tools
- **IF** it finds critical issues → **AUTOMATICALLY** spawns investigate-deeper
- **NO** "would you like me to investigate?" - just does it

### 2. Cost Optimization (Likely Triggers Recursion)
```bash
npm start "Find cost optimization opportunities in my cluster"
```
**Expected**:
- Runs cost analysis
- **IF** finds >$100/month waste → **AUTOMATICALLY** investigates deeper

### 3. Explicit Investigation Request (⭐ GUARANTEED RECURSION)
```bash
npm start "Analyze cluster health and investigate any critical issues deeper"
```
**Expected**:
- Runs initial analysis
- Finds issues
- **AUTOMATICALLY** calls `investigate-deeper` tool for EACH critical/high issue
- Creates multiple sub-investigation sessions

### 4. Zombie Workloads (⭐ GUARANTEED RECURSION)
```bash
npm start "Find zombie workloads"
```
**Expected**:
- Detects zombie workloads
- **FOR EACH** crash-loop/failed pod → **AUTOMATICALLY** spawns sub-investigation
- Sub-investigations would analyze logs, events (when we add those tools)

### 5. Multi-Level Recursion
```bash
npm start "Give me a complete cluster report and investigate any findings deeply"
```
**Expected**:
- Root investigation (depth 0)
- **AUTOMATICALLY** spawns sub-investigations for each finding (depth 1)
- Sub-investigations may spawn their own (depth 2)
- Max depth: 3 levels

## What to Look For

### Console Output
```
╔════════════════════════════════════════════════════════════════╗
║   Neurolink + K8s Ops Agent - Investigation Session Demo      ║
╚════════════════════════════════════════════════════════════════╝

✅ LLM provider detected
✅ Neurolink initialized
🔄 Initializing Session Manager...
✅ Investigation session created: session-1732876543210-abc123
   User: sre-engineer
   Goal: Analyze cluster health and Istio service mesh performance
   Session files stored in: .k8s-ops-sessions/

📦 Available tools:
   1. k8s-ops_get-cluster-snapshot
   2. k8s-ops_analyze-cost-optimization
   3. k8s-ops_detect-zombie-workloads
   4. k8s-ops_analyze-istio-traffic
   5. k8s-ops_investigate-deeper ← Look for this!

🚀 Running analysis: "your query here"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 STREAMING RESPONSE:

🔧 Tool started: k8s-ops_get-cluster-snapshot
✅ Tool completed: k8s-ops_get-cluster-snapshot

🔧 Tool started: k8s-ops_analyze-cost-optimization
✅ Tool completed: k8s-ops_analyze-cost-optimization

[If recursive investigation is triggered:]
🔧 Tool started: k8s-ops_investigate-deeper  ← KEY: This means recursion!
✅ Tool completed: k8s-ops_investigate-deeper

[Agent response here...]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 INVESTIGATION SESSION SUMMARY

Session ID: session-1732876543210-abc123
Status: active
Depth: 0 (root investigation)
Tools Executed: 5  ← Should include investigate-deeper if used
Findings: 0
Breadcrumbs: 0

🔬 Sub-investigations spawned: 2  ← Look for this!
   - session-1732876544331-def456
     Goal: Analyze why namespace payments has high CPU
     Status: started
     Depth: 1
   - session-1732876545123-ghi789
     Goal: Investigate crash-looping pod checkout-api
     Status: started
     Depth: 1

🔧 Tool Execution Timeline:
   1. ✅ get-cluster-snapshot (9821ms)
   2. ✅ analyze-cost-optimization (2156ms)
   3. ✅ investigate-deeper (1234ms)  ← Recursive tool!
   4. ✅ detect-zombie-workloads (1842ms)
   5. ✅ investigate-deeper (987ms)   ← Another one!

📁 Session persisted to: .k8s-ops-sessions/session-1732876543210-abc123.json
```

### Session Files
Check `.k8s-ops-sessions/` directory:

```bash
ls -la .k8s-ops-sessions/
```

Expected output:
```
.k8s-ops-sessions/
├── session-1732876543210-abc123.json  (root investigation)
├── session-1732876544331-def456.json  (sub-investigation 1)
└── session-1732876545123-ghi789.json  (sub-investigation 2)
```

Inspect a session:
```bash
cat .k8s-ops-sessions/session-*.json | jq .
```

Key fields to check:
- `depth`: Should be 0 for root, 1+ for sub-investigations
- `parentSessionId`: Sub-investigations should reference parent
- `childSessionIds`: Parent should list its children
- `toolExecutions`: Should show all tools executed
- `breadcrumbs`: Should show investigation steps

## Testing Scenarios

### Scenario 1: No Recursion (Baseline)
```bash
npm start "What is my cluster health status?"
```
**Verify**:
- ❌ `investigate-deeper` NOT called
- ✅ Only root session created
- ✅ Basic tools executed

### Scenario 2: Single-Level Recursion
```bash
npm start "Analyze cluster health. If you find issues, investigate them deeper."
```
**Verify**:
- ✅ `investigate-deeper` called at least once
- ✅ Sub-investigation session created (depth 1)
- ✅ Parent session has `childSessionIds`
- ✅ Child session has `parentSessionId`

### Scenario 3: Multi-Level Recursion
```bash
npm start "Complete cluster report. Investigate any findings deeply, and if sub-investigations find patterns, go even deeper (max 3 levels)."
```
**Verify**:
- ✅ Multiple levels of sub-investigations (depth 0, 1, 2)
- ✅ Investigation tree structure maintained
- ✅ Findings merged from child to parent

### Scenario 4: Cost-Focused Investigation
```bash
npm start "Find the top 3 most expensive cost issues and investigate each one to understand root causes"
```
**Verify**:
- ✅ Cost analysis runs first
- ✅ Multiple sub-investigations spawned (one per issue)
- ✅ Each sub-investigation has specific goal

## Troubleshooting

### No query provided
```
❌ No query provided!

Usage:
  npm start "your investigation query here"
```
**Solution**: Add a query as an argument

### investigate-deeper not called
If you expect recursion but it's not happening:

1. **Make query more explicit**:
   ```bash
   # Weak (might not trigger)
   npm start "Check cluster health"

   # Strong (likely to trigger)
   npm start "Check cluster health and investigate any critical issues deeper"
   ```

2. **Check system prompt** - Verify it mentions investigate-deeper

3. **Check tool registration**:
   ```bash
   # Should show 5 tools including investigate-deeper
   npm start "test" 2>&1 | grep "k8s-ops_investigate-deeper"
   ```

### Session files not created
```bash
# Check if directory exists
ls -la .k8s-ops-sessions/

# If missing, it will be created on first run
```

### LLM not using tools
Check the streaming output for tool execution logs:
```
🔧 Tool started: k8s-ops_get-cluster-snapshot
```

If you don't see this, the issue is likely with Neurolink/LLM configuration.

## Advanced Testing

### Resume a Session
```typescript
// In a custom script
const sessionManager = new SessionManager();
const oldSession = await sessionManager.getSession("session-123...");
console.log(oldSession.findings);
```

### View Investigation Tree
```bash
cat .k8s-ops-sessions/session-*.json | jq '{id, depth, parentSessionId, childSessionIds, goal}'
```

### Check Tool Execution History
```bash
cat .k8s-ops-sessions/session-*.json | jq '.toolExecutions[] | {toolId, durationMs, error}'
```

## Expected Results

### Successful Test Should Show
✅ Session created and saved
✅ All 5 tools registered
✅ Tools executed (visible in streaming output)
✅ Session summary displays
✅ Session file persisted
✅ If recursion requested: `investigate-deeper` called
✅ If recursion happened: Multiple session files created

### Session Summary Example
```
Session ID: session-1732876543210-abc123
Status: active
Depth: 0 (root investigation)
Tools Executed: 5
Findings: 0
Breadcrumbs: 0
Sub-investigations spawned: 2

Tool Execution Timeline:
   1. ✅ get-cluster-snapshot (9821ms)
   2. ✅ analyze-cost-optimization (2156ms)
   3. ✅ investigate-deeper (1234ms)
   4. ✅ detect-zombie-workloads (1842ms)
   5. ✅ investigate-deeper (987ms)
```
