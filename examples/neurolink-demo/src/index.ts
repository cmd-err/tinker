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

// Note: This is the full integration example.
// When Neurolink SDK is available, uncomment the imports below:
// import { createBestAIProvider, Neurolink } from "@juspay/neurolink";
// import { K8sOpsNeurolinkAgent, registerWithNeurolink } from "@cmd-err/k8s-ops-agent";

// For now, we use the built-in agent without Neurolink
import { K8sOpsNeurolinkAgent } from "@cmd-err/k8s-ops-agent";

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║       Neurolink + K8s Ops Agent - Full Demo                     ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // ============ OPTION 1: With Neurolink SDK (when available) ============
  /*
  // Initialize Neurolink with best available provider
  const provider = createBestAIProvider();
  const neurolink = new Neurolink({ provider });

  // Register K8s Ops tools with Neurolink
  await registerWithNeurolink(neurolink);

  // Create agent with LLM capabilities
  const agent = new K8sOpsNeurolinkAgent({
    k8sMode: "kubeconfig",
    neurolink: neurolink,
  });
  */

  // ============ OPTION 2: Without Neurolink SDK ============
  // Create agent without LLM (uses built-in summarization)
  const agent = new K8sOpsNeurolinkAgent({
    k8sMode: (process.env.K8S_MODE as "kubeconfig" | "incluster") || "kubeconfig",
  });

  console.log("ℹ️  Running demo without Neurolink SDK\n");
  console.log("   To enable LLM features, set GOOGLE_AI_API_KEY and uncomment");
  console.log("   the Neurolink initialization code above.\n");

  // ============ Demo Queries ============
  const queries = [
    // "Give me a full health report",
    // "What's wasting money in my cluster?",
    // "Find zombie workloads",
    // "Check Istio configuration",
  ];

  // Run a default full analysis
  console.log("🚀 Running full cluster analysis...\n");
  
  const result = await agent.query("Give me a complete cluster health and optimization report");

  console.log("━".repeat(70));
  console.log("\n📊 ANALYSIS RESULT:\n");
  console.log(result);
  console.log("\n" + "━".repeat(70));

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
