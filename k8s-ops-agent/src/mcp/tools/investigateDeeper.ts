/**
 * Investigate Deeper Tool (Simplified)
 * Records investigation intent and guides the LLM to investigate deeper
 * NO session spawning - just tracks investigation depth via breadcrumbs
 */

import { z } from "zod";
import type { K8sOpsTool, ToolResult, ToolExecutionContext } from "../../types.js";

/**
 * Input schema for investigate-deeper tool
 */
export const InvestigateDeeperInputSchema = z.object({
  goal: z
    .string()
    .min(10)
    .describe(
      "Specific investigation goal or question to explore deeply. Be precise and focused."
    ),
  hypothesis: z
    .string()
    .optional()
    .describe("Working hypothesis to test in this sub-investigation"),
  focus: z
    .array(
      z.enum([
        "metrics",
        "logs",
        "k8s-state",
        "cost",
        "performance",
        "reliability",
        "security",
        "istio",
      ])
    )
    .optional()
    .describe("Areas to focus on during investigation"),
});

export type InvestigateDeeperInput = z.infer<typeof InvestigateDeeperInputSchema>;

/**
 * Result of deeper investigation
 */
export interface DeeperInvestigationResult {
  /** Investigation goal */
  goal: string;
  /** Working hypothesis */
  hypothesis?: string;
  /** Focus areas */
  focus: string[];
  /** Guidance for next steps */
  guidance: string[];
  /** Message to LLM */
  message: string;
}

/**
 * Execute investigate-deeper tool
 * This is now simplified - just records the intent and guides the LLM
 */
async function executeInvestigateDeeper(
  input: InvestigateDeeperInput,
  context: ToolExecutionContext
): Promise<ToolResult<DeeperInvestigationResult>> {
  const startTime = Date.now();

  try {
    // Add breadcrumb to track this deeper investigation
    if (context.investigation?.addBreadcrumb) {
      const breadcrumb = `🔬 Deep investigation: ${input.goal}${input.hypothesis ? ` (hypothesis: ${input.hypothesis})` : ''}`;
      context.investigation.addBreadcrumb(breadcrumb);
    }

    // Determine which tools to suggest based on focus areas
    const suggestedTools: string[] = [];
    const focus = input.focus || ["k8s-state"];

    if (focus.includes("istio")) {
      suggestedTools.push("analyze-istio-traffic - Check VirtualServices, DestinationRules, routing");
    }
    if (focus.includes("cost")) {
      suggestedTools.push("analyze-cost-optimization - Find underutilized resources");
    }
    if (focus.includes("reliability")) {
      suggestedTools.push("detect-zombie-workloads - Check for failed pods, crash loops");
    }
    if (focus.includes("k8s-state")) {
      suggestedTools.push("get-cluster-snapshot - Fetch current cluster state");
    }

    const result: DeeperInvestigationResult = {
      goal: input.goal,
      hypothesis: input.hypothesis,
      focus: focus,
      guidance: suggestedTools.length > 0 ? suggestedTools : [
        "get-cluster-snapshot - Fetch current cluster state",
        "analyze-istio-traffic - Check Istio configuration",
        "detect-zombie-workloads - Find problematic pods",
      ],
      message: `Investigation started: ${input.goal}\n\nNext steps: Use the suggested tools to gather data and analyze the issue. Focus on: ${focus.join(", ")}`,
    };

    return {
      success: true,
      data: result,
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "INVESTIGATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Investigate Deeper Tool Definition
 */
export const investigateDeeperTool: K8sOpsTool<
  InvestigateDeeperInput,
  DeeperInvestigationResult
> = {
  id: "investigate-deeper",
  title: "Investigate Deeper (Focused Analysis)",
  description: `[AUTO-TRIGGER TOOL] Record investigation intent and guide deeper analysis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOU MUST call this tool IMMEDIATELY when you find:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ High resource usage (CPU >80%, Memory >80%)
✓ Failed/crash-looping pods
✓ Istio routing errors or misconfigurations
✓ Cost optimization opportunities >$100/month
✓ Any critical or high severity finding

DO NOT ask the user first. DO NOT wait. IMMEDIATELY call this tool to investigate.
This is how Senior SREs work: they see a problem, they dig into it RIGHT AWAY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After calling investigate-deeper, IMMEDIATELY follow the guidance and use the suggested tools
to gather data and analyze the issue. Don't stop until you find the root cause.

CORRECT USAGE:
❌ WRONG: Find issue → Ask user "would you like me to investigate?"
✅ CORRECT: Find issue → IMMEDIATELY call investigate-deeper → Use suggested tools → Find root cause

Examples:
- investigate-deeper({goal: "Find root cause of high CPU in pod vayu-api-7f8d", hypothesis: "Resource limits too low or N+1 database queries", focus: ["performance", "k8s-state"]})
- investigate-deeper({goal: "Determine why VirtualService breeze-app has missing subset", hypothesis: "Subset misconfiguration in DestinationRule", focus: ["istio"]})
- investigate-deeper({goal: "Analyze crash loop in payments pods", hypothesis: "Dependency service unavailable", focus: ["reliability", "k8s-state"]})`,
  inputSchema: InvestigateDeeperInputSchema,
  execute: executeInvestigateDeeper,
};
