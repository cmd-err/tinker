#!/usr/bin/env node
/**
 * Interactive test script for K8s Ops Agent with session management
 * Run with: node test-interactive.js
 */

import readline from 'readline';
import { spawn } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("╔═══════════════════════════════════════════════════════════════════╗");
console.log("║   K8s Ops Agent - Interactive Test                                ║");
console.log("╚═══════════════════════════════════════════════════════════════════╝\n");

console.log("📝 Example queries that will trigger recursive investigation:\n");
console.log("1. 'Analyze cluster health and investigate any critical issues deeply'");
console.log("2. 'Find pods with high CPU and investigate the root cause'");
console.log("3. 'Check for zombie workloads and dig deeper into why they failed'");
console.log("4. 'Find cost optimization opportunities and investigate the top 3 issues'\n");

rl.question('Enter your investigation query (or press Enter for default): ', (query) => {
  rl.close();

  const finalQuery = query.trim() || "Give me a complete cluster health report. For any critical issues, investigate them deeper.";

  console.log(`\n🚀 Starting investigation with query:\n"${finalQuery}"\n`);
  console.log("━".repeat(70) + "\n");

  // Run the demo with the query
  const child = spawn('node', ['dist/index.js', finalQuery], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    console.log(`\n━".repeat(70)`);
    console.log(`\n✅ Investigation completed with exit code: ${code}`);

    console.log("\n💡 Next steps:");
    console.log("   - Check .k8s-ops-sessions/ for session files");
    console.log("   - Run 'ls -la .k8s-ops-sessions/' to see saved sessions");
    console.log("   - Run 'cat .k8s-ops-sessions/session-*.json | jq .' to inspect session");
    console.log("   - Run this script again to start a new investigation\n");
  });
});
