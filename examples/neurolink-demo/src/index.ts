/**
 * Neurolink + K8s Ops Agent Demo
 *
 * This demonstrates the complete integration matching lighthouse pattern:
 * 1. Neurolink SDK with stream() for LLM orchestration
 * 2. K8s Ops Agent tools registered as MCP server
 * 3. Direct stream() usage (not agent wrapper)
 * 4. Proper tool execution handling
 *
 * Prerequisites:
 * - Set AZURE_OPENAI_API_KEY/ENDPOINT (recommended) or other LLM provider
 * - Have kubectl configured with access to a cluster
 */

// Disable Neurolink built-in tools (getCurrentTime, readFile, etc.) to prevent infinite loop
// This matches the lighthouse configuration and prevents tool conflicts
process.env.NEUROLINK_DISABLE_BUILTIN_TOOLS = "true";

import { NeuroLink } from "@juspay/neurolink";
import { registerK8sOpsWithNeurolink } from "@cmd-err/k8s-ops-agent";
import { InvestigationContext } from "@cmd-err/k8s-ops-agent/investigation";

async function main() {
  // Check for query argument
  const queryArg = process.argv[2];

  if (!queryArg) {
    console.log("╔════════════════════════════════════════════════════════════════╗");
    console.log("║   Neurolink + K8s Ops Agent - Investigation Session Demo      ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");

    console.error("❌ No query provided!\n");
    console.log("Usage:");
    console.log('  npm start "your investigation query here"\n');
    console.log("Example queries:");
    console.log('  npm start "Analyze cluster health and investigate any critical issues"');
    console.log('  npm start "Find cost optimization opportunities"');
    console.log('  npm start "Detect zombie workloads and investigate why they failed"');
    console.log('  npm start "Check Istio configuration for issues"\n');

    console.log("💡 Tip: Add 'investigate deeper' to your query to trigger recursive investigation");
    console.log('  Example: npm start "Find high CPU pods and investigate the root cause deeper"\n');
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║   Neurolink + K8s Ops Agent - Investigation Session Demo      ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Check if we have an LLM provider configured
  const hasLLMProvider = !!(
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.AZURE_OPENAI_API_KEY
  );

  if (!hasLLMProvider) {
    console.error("❌ No LLM provider detected!");
    console.error("\n   To run this demo, set one of:");
    console.error("   - AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT (Recommended - matches lighthouse)");
    console.error("   - GOOGLE_AI_API_KEY");
    console.error("   - OPENAI_API_KEY");
    console.error("   - ANTHROPIC_API_KEY\n");
    process.exit(1);
  }

  console.log("✅ LLM provider detected - running with Neurolink SDK\n");

  // ============ Initialize Neurolink (matching lighthouse configuration) ============
  console.log("🔄 Initializing Neurolink...");

  // Enable debug mode to see what's happening
  process.env.NEUROLINK_DEBUG = "true";

  const neurolink = new NeuroLink({
    enableOrchestration: false,  // Disable orchestration like lighthouse to prevent tool conflicts
    conversationMemory: {
      enabled: false,  // Can enable later if needed
      maxSessions: 10,
      maxTurnsPerSession: 50,
    }
  });

  console.log("✅ Neurolink initialized\n");

  // ============ Register External MCP Servers (Historical Data Analysis) ============
  console.log("🔄 Registering external MCP servers for historical data analysis...");

  // Check if observability backends are configured
  const hasGrafana = !!process.env.GRAFANA_URL && !!process.env.GRAFANA_API_KEY;
  const hasPrometheus = !!process.env.PROMETHEUS_URL;
  const hasLoki = !!process.env.LOKI_URL;

  if (hasGrafana || hasPrometheus || hasLoki) {
    try {
      // Option 1: Grafana MCP (unified interface - recommended)
      // Uses official Grafana MCP server: https://github.com/grafana/mcp-grafana
      if (hasGrafana) {
        console.log("   Adding Grafana MCP server (Prometheus + Loki queries)...");
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
        console.log("   ✅ Grafana MCP server registered");
      }

      // Option 2: Prometheus MCP (direct Prometheus queries)
      if (hasPrometheus && !hasGrafana) {
        console.log("   Adding Prometheus MCP server...");
        // Note: Requires prometheus-mcp-server to be installed separately
        await neurolink.addExternalMCPServer("prometheus", {
          id: "prometheus",
          name: "prometheus",
          description: "Prometheus MCP server for metrics time-series queries",
          transport: "stdio" as const,
          status: "initializing" as const,
          tools: [],
          command: process.env.PROMETHEUS_MCP_COMMAND || "python",
          args: process.env.PROMETHEUS_MCP_ARGS?.split(",") || ["-m", "prometheus_mcp_server.server"],
          env: {
            PROMETHEUS_URL: process.env.PROMETHEUS_URL!,
          },
        });
        console.log("   ✅ Prometheus MCP server registered");
      }

      // Option 3: Loki MCP (log queries)
      if (hasLoki && !hasGrafana) {
        console.log("   Adding Loki MCP server...");
        // Note: Requires loki-mcp to be installed separately
        await neurolink.addExternalMCPServer("loki", {
          id: "loki",
          name: "loki",
          description: "Loki MCP server for log aggregation queries",
          transport: "stdio" as const,
          status: "initializing" as const,
          tools: [],
          command: process.env.LOKI_MCP_COMMAND || "go",
          args: process.env.LOKI_MCP_ARGS?.split(",") || ["run", "./cmd/server"],
          cwd: process.env.LOKI_MCP_PATH,
          env: {
            LOKI_URL: process.env.LOKI_URL!,
          },
        });
        console.log("   ✅ Loki MCP server registered");
      }

      console.log("✅ External MCP servers registered\n");
    } catch (error) {
      console.log("⚠️  Could not register external MCP servers (this is optional):");
      console.log(`   ${error instanceof Error ? error.message : String(error)}`);
      console.log("   Continuing with K8s Ops tools only...\n");
    }
  } else {
    console.log("ℹ️  No observability backends configured (this is optional)");
    console.log("   To enable historical data analysis, set:");
    console.log("   - GRAFANA_URL + GRAFANA_API_KEY (recommended)");
    console.log("   - OR: PROMETHEUS_URL, LOKI_URL");
    console.log("   See .env.example for details\n");
  }

  // ============ Create Investigation Context (In-Memory Only) ============
  console.log("🔄 Creating investigation context...");
  const userQuery = queryArg; // User's investigation query
  const investigation = new InvestigationContext(userQuery);

  console.log(`✅ Investigation created: ${investigation.id}`);
  console.log(`   Goal: ${investigation.goal}`);
  console.log(`   Note: Ephemeral (in-memory only, no disk persistence)\n`);

  // Register K8s Ops tools with Neurolink - using investigation context
  console.log("🔄 Registering K8s Ops tools...");
  await registerK8sOpsWithNeurolink(neurolink as any, investigation);
  console.log("✅ K8s Ops tools registered\n");

  // List available tools
  try {
    const tools = await neurolink.getAllAvailableTools();
    console.log("📦 Available tools:");
    tools.forEach((tool: any, idx: number) => {
      console.log(`   ${idx + 1}. ${tool.name} ${tool.serverId ? `(from: ${tool.serverId})` : ''}`);
    });
    console.log();

    // CRITICAL DEBUG: Check if tools will actually be used in stream()
    console.log("🔍 Debug Info:");
    console.log(`   - Tools count: ${tools.length}`);
    console.log(`   - No disableTools parameter (matches lighthouse)`);
    console.log(`   - No maxSteps parameter (matches lighthouse)`);
    console.log(`   - Expected toolChoice: "auto" (default)`);
    console.log();
  } catch (error) {
    console.log("⚠️  Could not list tools:", error);
  }

  // ============ Run Analysis Using neurolink.stream() (LIGHTHOUSE PATTERN) ============
  console.log(`🚀 Running analysis: "${userQuery}"\n`);

  try {
    // Use stream() instead of generate() - matches lighthouse pattern
    const streamParams = {
      input: {
        text: userQuery
      },
      context: {
        sessionId: `k8s-demo-${Date.now()}`,
      },
      systemPrompt: `You are a Senior Site Reliability Engineer with 10+ years of experience debugging production Kubernetes clusters.

INVESTIGATION MODE - Ephemeral Investigation:
Investigation ID: ${investigation.id}
Goal: ${investigation.goal}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INVESTIGATION METHODOLOGY - CRITICAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You MUST follow this reasoning process and SHOW YOUR THINKING:

1. 🧠 UNDERSTAND THE PROBLEM TYPE
   - Is it constant or intermittent?
   - Is it affecting all requests or specific patterns?
   - When did it start? What changed?
   - What are the symptoms telling me about the root cause?

2. 🧠 FORM HYPOTHESES (ranked by probability)
   - Based on symptoms, what are the 3-5 most likely causes?
   - For each hypothesis, what evidence would prove/disprove it?
   - DON'T run tools randomly - design tests to validate hypotheses

3. 🧠 GATHER TARGETED EVIDENCE
   - Design specific tests to validate/refute each hypothesis
   - Follow the evidence trail - each tool call should answer a question
   - Use current cluster state + your domain knowledge

4. 🧠 REASON ABOUT EVIDENCE
   - What does this evidence tell me?
   - Does it support or refute my hypothesis?
   - What new hypotheses does it suggest?

5. 🎯 VALIDATE ROOT CAUSE
   - Don't just guess - PROVE the root cause
   - Show the causal chain: A caused B caused C → symptom
   - Provide confidence level (0-100%)

6. 🔧 RECOMMEND FIX WITH VERIFICATION
   - What specific action will fix this?
   - How can we verify the fix worked?
   - What monitoring should we add?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT - YOU MUST USE THIS STRUCTURE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🧠 UNDERSTANDING THE PROBLEM:
[Analyze the user's query - what type of issue is this?]

Key facts:
- [List what we know from the query]
- [Infer problem characteristics]

Problem type: [CATEGORY] (e.g., INTERMITTENT ROUTING, RESOURCE EXHAUSTION, etc.)

🧠 HYPOTHESES (ranked by probability):

1. [XX%] [Hypothesis 1]
   Evidence needed: [What would prove/disprove this]

2. [XX%] [Hypothesis 2]
   Evidence needed: [What would prove/disprove this]

3. [XX%] [Hypothesis 3]
   Evidence needed: [What would prove/disprove this]

🧠 INVESTIGATION:
[For each hypothesis you test, show:]
- Testing Hypothesis X...
- [Call tool to gather evidence]
- Observation: [What did the tool return?]
- Analysis: [What does this mean? Does it confirm/refute hypothesis?]

🎯 ROOT CAUSE (if found):
Cause: [Specific root cause]
Evidence:
  - [Evidence point 1]
  - [Evidence point 2]
Causal chain: [A] → [B] → [C] → [symptom]
Confidence: XX%

🔧 RECOMMENDED FIX:
[Specific kubectl/config changes needed]

Verification:
1. [How to verify fix worked]
2. [What metrics/logs to check]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ ALWAYS show your reasoning using the format above
✓ ALWAYS form hypotheses BEFORE calling tools
✓ ALWAYS explain what each tool result means
✓ ALWAYS connect findings back to the user's original question
✓ NEVER just dump tool results without analysis
✓ NEVER run tools randomly - each call should test a hypothesis
✓ NEVER skip showing your thought process

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AVAILABLE TOOLS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Core Analysis:
- get-cluster-snapshot: Fetch current K8s state (nodes, pods, workloads, HPAs, Istio)
  Returns: {snapshotId, summary} - use snapshotId for other tools

- analyze-cost-optimization: Find underutilized resources, overprovisioning
  Input: {snapshotId} - get from cluster snapshot first

- detect-zombie-workloads: Find crash loops, failed pods, unhealthy nodes
  Input: {snapshotId}

- analyze-istio-traffic: Check routing, VirtualServices, DestinationRules
  Input: {snapshotId}

- investigate-deeper: Deep dive into a specific finding
  When to use: When you find critical/high severity issues
  Input: {goal, hypothesis, focus}
  This guides you to use other tools more effectively

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HISTORICAL DATA TOOLS (For Intermittent/Temporal Issues):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: For INTERMITTENT or HISTORICAL issues (\"rarely\", \"sometimes\", \"2 hours ago\"),
          you MUST query historical data FIRST. Live cluster state won't show past events!

Available tools (if observability backends are configured):
- Grafana MCP tools OR Prometheus/Loki tools (depends on user's setup)

Common Prometheus Queries (PromQL):
- 503 error rate over time:
  sum(rate(istio_requests_total{response_code=\"503\"}[5m])) by (destination_service)

- Pod CPU/Memory usage trends:
  container_cpu_usage_seconds_total{namespace=\"breeze\",pod=~\"api-.*\"}
  container_memory_usage_bytes{namespace=\"breeze\",pod=~\"api-.*\"}

- Request latency p95:
  histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

Common Loki Queries (LogQL):
- Find 503 errors in envoy logs:
  {namespace=\"breeze\"} |= \"503\" | json | destination_service=\"api-analytics\"

- Find OOMKilled events:
  {namespace=\"breeze\"} |= \"OOMKilled\" | json

- Find errors in application logs:
  {namespace=\"breeze\",app=\"api-analytics\"} |= \"ERROR\" | json

Temporal Analysis Pattern (EXAMPLE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 HYPOTHESIS: Rare 503 errors caused by Istio routing misconfiguration

Step 1: Query Prometheus - \"Show 503 rate for last 7 days\"
  → Observation: Spikes every 2-3 hours at 0.1 req/s
  → Analysis: Not constant - confirms intermittent issue

Step 2: Query Loki - \"Show envoy logs during spike times\"
  → Observation: \"NO_HEALTHY_UPSTREAM\" for subset 'v2'
  → Analysis: Traffic being routed to non-existent subset

Step 3: Check K8s state - \"Get current VirtualService config\"
  → Observation: VirtualService routes to 'v2', DestinationRule only defines 'v1'
  → Analysis: CONFIRMED - subset mismatch

🎯 ROOT CAUSE: VirtualService misconfiguration (routes to non-existent subset 'v2')
Causal chain: Request → VirtualService routes to 'v2' → Subset not found → Envoy 503
Confidence: 95%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use Cases That REQUIRE Historical Data:
✓ Intermittent errors (\"503 errors rarely\", \"occasional OOMKilled\")
✓ Performance degradation (\"service slow 2 hours ago\", \"latency increased\")
✓ Temporal patterns (\"errors every night at 2am\", \"CPU spikes after deployment\")
✓ Trend analysis (\"memory usage over last 7 days\", \"request rate patterns\")

Use Cases That DON'T Need Historical Data:
✓ Current cluster state (\"check cluster health now\", \"list all pods\")
✓ Configuration analysis (\"check Istio routing config\", \"analyze resource limits\")
✓ Cost optimization (\"find underutilized resources now\")

Think like a Senior SRE: Reason → Hypothesize → Test → Validate → Fix`,
      temperature: 0.3,
      maxTokens: 4000,
      // Add explicit provider/model like lighthouse does (only when orchestration is disabled)
      // Defaults to Azure OpenAI (matching lighthouse configuration)
      provider: process.env.LLM_PROVIDER || "azure",
      model: process.env.LLM_MODEL || "gpt-4o-automatic",
      // CRITICAL: Explicitly disable tools disabling (force tools to be enabled)
      disableTools: false,
    } as any;

    const streamResult = await neurolink.stream(streamParams);

    // Process streaming response like lighthouse (sessionInstanceManager.ts:808-894)
    let accumulatedResponse = '';
    let toolsUsed: string[] = [];

    console.log("━".repeat(70));
    console.log("📊 STREAMING RESPONSE:\n");

    for await (const chunk of streamResult.stream) {
      if (chunk && typeof chunk === 'object') {
        // Handle content chunks
        if ('content' in chunk && typeof chunk.content === 'string') {
          process.stdout.write(chunk.content);
          accumulatedResponse += chunk.content;
        }

        // Handle tool execution events
        if ('toolExecution' in chunk && chunk.toolExecution) {
          const toolExecution = chunk.toolExecution as any;
          if (toolExecution.type === 'tool:start') {
            console.log(`\n\n🔧 Tool started: ${toolExecution.tool}`);
            if (!toolsUsed.includes(toolExecution.tool)) {
              toolsUsed.push(toolExecution.tool);
            }
          } else if (toolExecution.type === 'tool:end') {
            if (toolExecution.error) {
              console.log(`⚠️  Tool error: ${toolExecution.tool} - ${toolExecution.error}\n`);
            } else {
              console.log(`✅ Tool completed: ${toolExecution.tool}\n`);
            }
          }
        }
      }
    }

    console.log("\n" + "━".repeat(70));

    if (toolsUsed.length > 0) {
      console.log(`\n🔧 Tools used: ${toolsUsed.join(", ")}`);
    }

    console.log("\n✅ Analysis complete!");

    // ============ Show Investigation Summary ============
    console.log("\n" + "━".repeat(70));
    console.log("📋 INVESTIGATION SUMMARY\n");

    const summary = investigation.getSummary();
    console.log(`Investigation ID: ${summary.id}`);
    console.log(`Goal: ${summary.goal}`);
    console.log(`Duration: ${summary.duration}ms`);
    console.log(`Findings: ${summary.findingsCount}`);

    if (summary.findingsCount > 0) {
      console.log(`\n🔍 Findings by Severity:`);
      const critical = investigation.getCriticalFindings();
      if (critical.length > 0) {
        console.log(`   Critical/High: ${critical.length}`);
        critical.slice(0, 3).forEach((f: any, idx: number) => {
          console.log(`   ${idx + 1}. [${f.severity.toUpperCase()}] ${f.title}`);
        });
      }
    }

    if (summary.breadcrumbs.length > 0) {
      console.log(`\n🥖 Investigation Trail (${summary.breadcrumbs.length} steps):`);
      summary.breadcrumbs.slice(0, 10).forEach((crumb: string, idx: number) => {
        console.log(`   ${idx + 1}. ${crumb}`);
      });
      if (summary.breadcrumbs.length > 10) {
        console.log(`   ... and ${summary.breadcrumbs.length - 10} more steps`);
      }
    }

    console.log("\n💡 Note: Investigation was ephemeral (in-memory only, not persisted)");
    console.log("━".repeat(70));

  } catch (error) {
    console.error("\n❌ Error during analysis:", error);
    throw error;
  }

  // Show investigation capabilities
  console.log("\n💡 Investigation Features:");
  console.log("   ✅ Ephemeral context - fast, no disk I/O");
  console.log("   ✅ Automatic investigation - finds issues and digs deeper");
  console.log("   ✅ Breadcrumb trail - tracks all investigation steps");
  console.log("   ✅ Finding accumulation - collects discoveries in-memory");
  console.log("   ✅ Snapshot sharing - tools share cluster state efficiently");

  console.log("\n💡 Try other investigation scenarios:");
  console.log('   - "Find the root cause of high CPU in namespace X"');
  console.log('   - "Why are pods in service Y crash looping?"');
  console.log('   - "Investigate performance degradation after deployment"');
  console.log('   - "Deep dive into Istio routing issues"\n');
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  console.error("\n   Make sure you have:");
  console.error("   1. kubectl configured with cluster access");
  console.error("   2. Built the k8s-ops-agent: cd k8s-ops-agent && npm run build");
  console.error("   3. Set Azure OpenAI credentials in .env file:");
  console.error("      - AZURE_OPENAI_API_KEY");
  console.error("      - AZURE_OPENAI_ENDPOINT");
  console.error("      - AZURE_OPENAI_DEPLOYMENT (optional, defaults to gpt-4o-automatic)");
  process.exit(1);
});
