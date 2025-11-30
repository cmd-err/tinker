#!/usr/bin/env node
/**
 * Demo: Run K8s Ops Neurolink Agent
 * 
 * This demonstrates the full agent experience with:
 * - Natural language query processing
 * - Multi-tool orchestration
 * - LLM-powered summarization (when available)
 * 
 * Usage:
 *   npm run dev:neurolink
 *   npm run dev:neurolink -- "What's wasting money in my cluster?"
 *   npm run dev:neurolink -- "Find zombie workloads"
 */

import { K8sOpsNeurolinkAgent } from "../sdk/neurolinkAgent.js";

// Example queries to demonstrate capabilities
const exampleQueries = [
  "Give me a full health report of the cluster",
  "What's wasting money in my cluster?",
  "Are there any zombie or stuck workloads?",
  "Check the Istio traffic configuration",
  "Quick health check",
];

async function main() {
  const args = process.argv.slice(2);
  const userQuery = args.join(" ") || exampleQueries[0];

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║       K8s Ops Neurolink Agent - Demo                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Create the agent
  const agent = new K8sOpsNeurolinkAgent({
    k8sMode: (process.env.K8S_MODE as "kubeconfig" | "incluster") || "kubeconfig",
    // In production, you would pass a Neurolink instance:
    // neurolink: await createNeurolink(),
  });

  // Note: Without Neurolink SDK, we use built-in summarization
  console.log("ℹ️  Running without Neurolink SDK (using built-in summarization)\n");
  console.log("   To enable LLM-powered summarization, install @juspay/neurolink");
  console.log("   and pass a Neurolink instance to the agent.\n");

  // Process the query
  console.log("━".repeat(60));
  const response = await agent.query(userQuery);
  console.log("━".repeat(60));
  console.log("\n📊 RESULT:\n");
  console.log(response);
  console.log("\n" + "━".repeat(60));

  // Show example queries
  console.log("\n💡 Example queries you can try:");
  exampleQueries.forEach((q, i) => {
    console.log(`   ${i + 1}. "${q}"`);
  });
  console.log("\n   Run with: npm run dev:neurolink -- \"your query here\"");
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});
