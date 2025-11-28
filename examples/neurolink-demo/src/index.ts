/**
 * Neurolink + K8s Ops Agent Demo
 * 
 * This demonstrates the complete integration of:
 * 1. Neurolink SDK for LLM orchestration
 * 2. K8s Ops Agent for cluster analysis
 * 3. Natural language queries
 * 4. Intelligent summarization
 * 
 * Prerequisites:
 * - Set GOOGLE_AI_API_KEY or OPENAI_API_KEY environment variable
 * - Have kubectl configured with access to a cluster
 */

import { NeuroLink } from "@juspay/neurolink";
import { K8sOpsNeurolinkAgent, registerK8sOpsWithNeurolink, type NeuroLinkInstance } from "@cmd-err/k8s-ops-agent";

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       Neurolink + K8s Ops Agent - Full Demo                     ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Check if we have an LLM provider configured
  const hasLLMProvider = !!(process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY);

  if (hasLLMProvider) {
    console.log("✅ LLM provider detected - running with Neurolink SDK\n");

    // ============ OPTION 1: With Neurolink SDK ============
    // Initialize Neurolink (it auto-detects the best provider from env vars)
    const neurolink = new NeuroLink({
      enableOrchestration: true,
    });

    // Register K8s Ops tools with Neurolink as an in-memory MCP server
    // Cast to our interface for type compatibility
    await registerK8sOpsWithNeurolink(neurolink as unknown as NeuroLinkInstance);

    // Create agent with LLM capabilities
    const agent = new K8sOpsNeurolinkAgent({
      k8sMode: (process.env.K8S_MODE as "kubeconfig" | "incluster") || "kubeconfig",
    });

    // Run with Neurolink for LLM-powered summarization
    console.log("🚀 Running full cluster analysis with LLM summarization...\n");
    const result = await agent.query("Give me a complete cluster health and optimization report");

    console.log("━".repeat(70));
    console.log("\n📊 ANALYSIS RESULT:\n");
    console.log(result);
    console.log("\n" + "━".repeat(70));
  } else {
    console.log("ℹ️  No LLM provider detected - running with built-in summarization\n");
    console.log("   To enable LLM features, set GOOGLE_AI_API_KEY or OPENAI_API_KEY\n");

    // ============ OPTION 2: Without Neurolink SDK ============
    // Create agent without LLM (uses built-in summarization)
    const agent = new K8sOpsNeurolinkAgent({
      k8sMode: (process.env.K8S_MODE as "kubeconfig" | "incluster") || "kubeconfig",
    });

    console.log("🚀 Running full cluster analysis...\n");
    const result = await agent.query("Give me a complete cluster health and optimization report");

    console.log("━".repeat(70));
    console.log("\n📊 ANALYSIS RESULT:\n");
    console.log(result);
    console.log("\n" + "━".repeat(70));
  }

  // Show how to use different intents
  console.log("\n💡 You can also run specific analyses:");
  console.log("   - agent.runAnalysis('cluster-health-check')");
  console.log("   - agent.runAnalysis('cost-optimization')");
  console.log("   - agent.runAnalysis('zombie-detection')");
  console.log("   - agent.runAnalysis('istio-analysis')");
  console.log("   - agent.runAnalysis('full-cluster-report')");
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  console.error("\n   Make sure you have:");
  console.error("   1. kubectl configured with cluster access");
  console.error("   2. Built the k8s-ops-agent: cd k8s-ops-agent && npm run build");
  process.exit(1);
});
