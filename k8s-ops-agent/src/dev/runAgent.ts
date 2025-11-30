#!/usr/bin/env node
/**
 * Run Agent Demo
 * Demonstrates the K8s Ops Agent orchestration
 */

import { K8sOpsAgent, type AgentEvent } from "../agent/index.js";
import { getK8sMode } from "../mcp/k8sClient.js";

async function main() {
  console.log("🤖 K8s Ops Agent Demo\n");
  console.log("=".repeat(60));

  const k8sMode = getK8sMode();
  console.log(`\n📡 Kubernetes Mode: ${k8sMode}\n`);

  // Create agent with verbose logging
  const agent = new K8sOpsAgent({
    k8sMode,
    verbose: true,
    includeRawData: false,
    logger: (msg) => console.log(`   ${msg}`),
  });

  // Add event handler for progress
  agent.onEvent((event: AgentEvent) => {
    if (event.type === "step-started") {
      console.log(`\n🔄 ${event.data.message}`);
    } else if (event.type === "step-completed") {
      console.log(`   ✅ ${event.data.message}`);
    } else if (event.type === "step-failed") {
      console.log(`   ❌ ${event.data.message}`);
    }
  });

  // Determine which intent to run
  const intent = process.argv[2] || "full-cluster-report";
  const validIntents = [
    "cluster-health-check",
    "cost-optimization",
    "zombie-detection",
    "istio-analysis",
    "full-cluster-report",
  ];

  if (!validIntents.includes(intent)) {
    console.error(`\n❌ Invalid intent: ${intent}`);
    console.log(`\nValid intents:`);
    validIntents.forEach((i) => console.log(`  - ${i}`));
    process.exit(1);
  }

  console.log(`\n🎯 Running intent: ${intent}\n`);
  console.log("-".repeat(60));

  try {
    // Run the agent
    const result = await agent.run({
      intent: intent as Parameters<typeof agent.run>[0]["intent"],
      includeIstio: true,
    });

    console.log("\n" + "=".repeat(60));
    console.log("📊 AGENT RESULTS");
    console.log("=".repeat(60));

    // Print summary
    console.log(`\n${result.summary.headline}`);
    console.log(`\n📈 Health Score: ${result.summary.healthScore}/100 (${result.summary.healthStatus})`);

    console.log("\n📊 Statistics:");
    console.log(`   Nodes: ${result.summary.stats.nodesHealthy}/${result.summary.stats.nodesTotal} healthy`);
    console.log(`   Pods: ${result.summary.stats.podsHealthy}/${result.summary.stats.podsTotal} running`);
    console.log(`   Zombies: ${result.summary.stats.zombiesFound}`);
    console.log(`   Cost Issues: ${result.summary.stats.costIssuesFound}`);
    console.log(`   Istio Issues: ${result.summary.stats.istioIssuesFound}`);

    if (result.summary.potentialMonthlySavings) {
      console.log(`\n💰 Potential Monthly Savings: $${result.summary.potentialMonthlySavings.toFixed(2)}`);
    }

    console.log("\n🎯 Top Priorities:");
    result.summary.topPriorities.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p}`);
    });

    console.log("\n📝 Narrative:");
    console.log(`   ${result.summary.narrative}`);

    // Print findings
    if (result.findings.length > 0) {
      console.log("\n" + "-".repeat(60));
      console.log("🔍 FINDINGS");
      console.log("-".repeat(60));

      const severityEmoji: Record<string, string> = {
        critical: "🚨",
        high: "🔴",
        medium: "🟡",
        low: "🟢",
        info: "ℹ️",
      };

      for (const finding of result.findings.slice(0, 10)) {
        console.log(`\n${severityEmoji[finding.severity] || "•"} [${finding.category.toUpperCase()}] ${finding.title}`);
        console.log(`   ${finding.description}`);
        if (finding.suggestedAction) {
          console.log(`   → ${finding.suggestedAction}`);
        }
        if (finding.impact) {
          console.log(`   💰 ${finding.impact}`);
        }
      }

      if (result.findings.length > 10) {
        console.log(`\n   ... and ${result.findings.length - 10} more findings`);
      }
    }

    // Execution stats
    console.log("\n" + "-".repeat(60));
    console.log("⏱️  EXECUTION STATS");
    console.log("-".repeat(60));
    console.log(`   Total Duration: ${result.totalDurationMs}ms`);
    console.log(`   Steps Executed: ${result.steps.length}`);
    result.steps.forEach((step) => {
      const emoji = step.status === "success" ? "✅" : step.status === "error" ? "❌" : "⏳";
      console.log(`   ${emoji} ${step.toolId}: ${step.durationMs ?? 0}ms`);
    });

    console.log("\n" + "=".repeat(60));
    console.log(result.success ? "✅ Agent completed successfully" : "❌ Agent completed with errors");
    console.log("=".repeat(60) + "\n");

  } catch (error) {
    console.error("\n💥 Agent failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
