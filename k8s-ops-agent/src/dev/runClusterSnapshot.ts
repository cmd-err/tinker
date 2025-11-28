/**
 * Development test harness for get-cluster-snapshot
 *
 * Run with: pnpm build && pnpm dev:snapshot
 */

import { getClusterSnapshotTool } from "../mcp/tools/getClusterSnapshot.js";
import { analyzeCostOptimizationTool } from "../mcp/tools/analyzeCostOptimization.js";
import { detectZombieWorkloadsTool } from "../mcp/tools/detectZombieWorkloads.js";
import { analyzeIstioTrafficTool } from "../mcp/tools/analyzeIstioTraffic.js";
import type {
  ToolExecutionContext,
  ClusterSnapshot,
  CostRecommendation,
  ZombieWorkload,
  IstioTopologyIssue,
} from "../types.js";
import { getK8sMode } from "../mcp/k8sClient.js";

async function main(): Promise<void> {
  const mode = getK8sMode();
  console.log(`\n🔧 K8s Ops Agent - Development Test Harness`);
  console.log(`📍 Running in ${mode} mode\n`);

  const context: ToolExecutionContext = {
    k8sMode: mode,
    timeout: 30000,
    logger: (msg) => console.log(`  📝 ${msg}`),
  };

  // 1. Get cluster snapshot
  console.log("━".repeat(60));
  console.log("1️⃣  Running get-cluster-snapshot...\n");

  const snapshotResult = await getClusterSnapshotTool.execute(
    {
      includeIstio: true,
      includeSystemNamespaces: false,
    },
    context
  );

  if (!snapshotResult.success || !snapshotResult.data) {
    console.error("❌ Failed to get cluster snapshot:");
    console.error(snapshotResult.error);
    process.exit(1);
  }

  const snapshot: ClusterSnapshot = snapshotResult.data;
  console.log(`\n✅ Cluster Snapshot Retrieved:`);
  console.log(`   📦 Nodes: ${snapshot.nodes.length}`);
  console.log(`   📂 Namespaces: ${snapshot.namespaces.length}`);
  console.log(`   🚀 Workloads: ${snapshot.workloads.length}`);
  console.log(`   🐳 Pods: ${snapshot.pods.length}`);
  console.log(`   📊 HPAs: ${snapshot.hpas.length}`);

  if (snapshot.istio) {
    console.log(`   🌐 VirtualServices: ${snapshot.istio.virtualServices.length}`);
    console.log(`   🎯 DestinationRules: ${snapshot.istio.destinationRules.length}`);
    console.log(`   🚪 Gateways: ${snapshot.istio.gateways.length}`);
  }

  console.log(`   ⏱️  Execution time: ${snapshotResult.metadata?.executionTimeMs}ms\n`);

  // 2. Analyze cost optimization
  console.log("━".repeat(60));
  console.log("2️⃣  Running analyze-cost-optimization...\n");

  const costResult = await analyzeCostOptimizationTool.execute(
    {
      snapshot,
      thresholds: {
        nodeUtilizationLow: 0.3,
        workloadOverprovisionRatio: 2,
        idlePodThresholdHours: 24,
      },
    },
    context
  );

  if (costResult.success && costResult.data) {
    console.log(`\n✅ Cost Analysis Complete:`);
    console.log(`   📋 ${costResult.data.summary}`);
    console.log(`   💡 Recommendations: ${costResult.data.recommendations.length}`);

    if (costResult.data.recommendations.length > 0) {
      console.log("\n   Top recommendations:");
      costResult.data.recommendations.slice(0, 3).forEach((rec: CostRecommendation, i: number) => {
        console.log(`   ${i + 1}. [${rec.severity.toUpperCase()}] ${rec.description}`);
      });
    }

    console.log(`   ⏱️  Execution time: ${costResult.metadata?.executionTimeMs}ms\n`);
  } else {
    console.error("❌ Cost analysis failed:", costResult.error);
  }

  // 3. Detect zombie workloads
  console.log("━".repeat(60));
  console.log("3️⃣  Running detect-zombie-workloads...\n");

  const zombieResult = await detectZombieWorkloadsTool.execute(
    {
      snapshot,
      thresholds: {
        idleDaysThreshold: 7,
        crashLoopRestartThreshold: 5,
        stuckPodHours: 24,
      },
    },
    context
  );

  if (zombieResult.success && zombieResult.data) {
    console.log(`\n✅ Zombie Detection Complete:`);
    console.log(`   📋 ${zombieResult.data.summary}`);
    console.log(`   🧟 Zombies found: ${zombieResult.data.zombieCount}`);

    if (zombieResult.data.zombies.length > 0) {
      console.log("\n   Top zombie workloads:");
      zombieResult.data.zombies.slice(0, 3).forEach((zombie: ZombieWorkload, i: number) => {
        console.log(
          `   ${i + 1}. [${zombie.severity.toUpperCase()}] ${zombie.kind} ${zombie.namespace ? `${zombie.namespace}/` : ""}${zombie.name}`
        );
        console.log(`      Reason: ${zombie.reason}`);
      });
    }

    console.log(`   ⏱️  Execution time: ${zombieResult.metadata?.executionTimeMs}ms\n`);
  } else {
    console.error("❌ Zombie detection failed:", zombieResult.error);
  }

  // 4. Analyze Istio traffic
  console.log("━".repeat(60));
  console.log("4️⃣  Running analyze-istio-traffic...\n");

  const istioResult = await analyzeIstioTrafficTool.execute(
    {
      snapshot,
      options: {
        includeTopology: true,
        checkMTLS: true,
      },
    },
    context
  );

  if (istioResult.success && istioResult.data) {
    console.log(`\n✅ Istio Analysis Complete:`);
    console.log(`   📋 ${istioResult.data.summary}`);
    console.log(`   ⚠️  Issues found: ${istioResult.data.issueCount}`);

    if (istioResult.data.issues.length > 0) {
      console.log("\n   Top Istio issues:");
      istioResult.data.issues.slice(0, 3).forEach((issue: IstioTopologyIssue, i: number) => {
        console.log(`   ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.type}`);
        console.log(`      ${issue.description}`);
      });
    }

    if (istioResult.data.topology) {
      console.log(`\n   📊 Topology:`);
      console.log(`      Nodes: ${istioResult.data.topology.nodes.length}`);
      console.log(`      Edges: ${istioResult.data.topology.edges.length}`);
    }

    console.log(`   ⏱️  Execution time: ${istioResult.metadata?.executionTimeMs}ms\n`);
  } else {
    console.error("❌ Istio analysis failed:", istioResult.error);
  }

  console.log("━".repeat(60));
  console.log("✨ All analyses complete!\n");

  // Optionally output full JSON
  if (process.env.FULL_OUTPUT === "true") {
    console.log("\n📄 Full Cluster Snapshot JSON:");
    console.log(JSON.stringify(snapshot, null, 2));
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
