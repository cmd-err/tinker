/**
 * Neurolink + K8s Ops Agent Demo
 * 
 * This demonstrates the complete integration of:
 * 1. Neurolink SDK for LLM orchestration (AI decides which tools to call)
 * 2. K8s Ops Agent for cluster analysis via MCP tools
 * 3. Natural language queries processed by the LLM
 * 4. Intelligent summarization by the LLM
 * 
 * Prerequisites:
 * - Set GOOGLE_AI_API_KEY or OPENAI_API_KEY environment variable
 * - Have kubectl configured with access to a cluster
 */

import { NeuroLink } from "@juspay/neurolink";
import { registerK8sOpsWithNeurolink, K8sOpsNeurolinkAgent, type NeuroLinkInstance } from "@cmd-err/k8s-ops-agent";

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       Neurolink + K8s Ops Agent - Full Demo                     ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Check if we have an LLM provider configured
  const hasLLMProvider = !!(process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.ANTHROPIC_API_KEY);

  if (hasLLMProvider) {
    console.log("✅ LLM provider detected - running with Neurolink SDK\n");
    console.log("🧠 Using LLM to orchestrate tool calls and generate summaries\n");

    // ============ TRUE NEUROLINK ORCHESTRATION ============
    // Initialize Neurolink with orchestration enabled
    // This allows the LLM to decide which tools to call based on the query
    const neurolink = new NeuroLink({
      enableOrchestration: true,
    });

    // Register K8s Ops tools with Neurolink as an in-memory MCP server
    // This makes our tools available for the LLM to discover and use
    await registerK8sOpsWithNeurolink(neurolink as unknown as NeuroLinkInstance);
    console.log("✅ K8s Ops tools registered with Neurolink\n");

    // List available tools that the LLM can use
    const tools = await neurolink.getAllAvailableTools();
    console.log(`📦 Available MCP tools for LLM: ${tools.map(t => t.name).join(", ")}\n`);

    // Now use Neurolink's generate() method - the LLM will:
    // 1. Understand the natural language query
    // 2. Decide which K8s tools to call
    // 3. Execute the tools via MCP
    // 4. Synthesize the results into a response
    console.log("🚀 Running LLM-orchestrated cluster analysis...\n");
    console.log("📝 Query: \"Give me a complete cluster health and optimization report\"\n");
    console.log("━".repeat(70));

    try {
      const result = await neurolink.generate({
        input: {
          text: "Give me a complete cluster health and optimization report. Use the available K8s tools to get a cluster snapshot, analyze cost optimization opportunities, detect zombie workloads, and check Istio traffic issues. Provide a comprehensive summary with actionable recommendations."
        },
        systemPrompt: `You are a Kubernetes operations expert assistant with access to cluster analysis tools.

Available tools:
- get-cluster-snapshot: Fetches nodes, pods, workloads, HPAs, and Istio resources from the K8s cluster
- analyze-cost-optimization: Identifies underutilized nodes, overprovisioned workloads, and idle namespaces with savings estimates
- detect-zombie-workloads: Finds crash-looping pods, failed pods, stuck pending pods, and unhealthy nodes
- analyze-istio-traffic: Detects unused/missing subsets, orphan VirtualServices, and misconfigured routes

When analyzing the cluster:
1. First get a cluster snapshot to understand the current state
2. Then run the appropriate analysis tools based on the user's request
3. Synthesize the findings into a clear, actionable report
4. Prioritize issues by severity and provide specific recommendations`,
        temperature: 0.3,
        maxTokens: 4000,
      });

      console.log("\n📊 LLM-GENERATED ANALYSIS RESULT:\n");
      console.log(result.content);
      
      if (result.toolsUsed && result.toolsUsed.length > 0) {
        console.log("\n🔧 Tools used by LLM:", result.toolsUsed.join(", "));
      }
      
      if (result.toolExecutions && result.toolExecutions.length > 0) {
        console.log("\n📋 Tool executions:");
        result.toolExecutions.forEach((exec, i) => {
          console.log(`   ${i + 1}. ${exec.name}`);
        });
      }
      
      console.log("\n" + "━".repeat(70));

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("❌ LLM generation failed:", errorMsg);
      
      // Fallback to the non-LLM agent
      console.log("\n⚠️  Falling back to built-in agent orchestration...\n");
      const agent = new K8sOpsNeurolinkAgent({
        k8sMode: (process.env.K8S_MODE as "kubeconfig" | "incluster") || "kubeconfig",
      });
      const fallbackResult = await agent.query("Give me a complete cluster health and optimization report");
      console.log(fallbackResult);
    }

  } else {
    console.log("ℹ️  No LLM provider detected - running with built-in orchestration\n");
    console.log("   To enable LLM features, set one of:");
    console.log("   - GOOGLE_AI_API_KEY");
    console.log("   - OPENAI_API_KEY");
    console.log("   - ANTHROPIC_API_KEY\n");

    // ============ BUILT-IN ORCHESTRATION (No LLM) ============
    // Create agent without LLM (uses rule-based intent detection and built-in summarization)
    const agent = new K8sOpsNeurolinkAgent({
      k8sMode: (process.env.K8S_MODE as "kubeconfig" | "incluster") || "kubeconfig",
    });

    console.log("🚀 Running cluster analysis with built-in orchestration...\n");
    const result = await agent.query("Give me a complete cluster health and optimization report");

    console.log("━".repeat(70));
    console.log("\n📊 ANALYSIS RESULT:\n");
    console.log(result);
    console.log("\n" + "━".repeat(70));
  }

  // Show how to use different intents
  console.log("\n💡 Available analysis types:");
  console.log("   - cluster-health-check  → Quick health status");
  console.log("   - cost-optimization     → Find cost savings");
  console.log("   - zombie-detection      → Find stuck/failed workloads");
  console.log("   - istio-analysis        → Check service mesh config");
  console.log("   - full-cluster-report   → Complete audit\n");
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  console.error("\n   Make sure you have:");
  console.error("   1. kubectl configured with cluster access");
  console.error("   2. Built the k8s-ops-agent: cd k8s-ops-agent && npm run build");
  process.exit(1);
});
