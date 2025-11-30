/**
 * Investigation Context
 * Lightweight in-memory context for tracking an investigation
 * NO persistence, NO JSON serialization - just runtime state
 */

import type { Finding, InvestigationSummary } from "./types.js";

/**
 * In-memory investigation context
 * Lasts for the duration of a single investigation, then discarded
 */
export class InvestigationContext {
  /** Unique investigation ID */
  id: string;

  /** User's investigation goal/query */
  goal: string;

  /** When investigation started */
  startedAt: Date;

  /** In-memory snapshot store (shared across all tools) */
  snapshotStore: Map<string, any>;

  /** Accumulated findings from tools */
  findings: Finding[];

  /** Breadcrumb trail of investigation steps */
  breadcrumbs: string[];

  constructor(goal: string) {
    this.id = `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.goal = goal;
    this.startedAt = new Date();
    this.snapshotStore = new Map();
    this.findings = [];
    this.breadcrumbs = [];
  }

  /**
   * Add a finding from a tool
   */
  addFinding(finding: Finding): void {
    this.findings.push(finding);
  }

  /**
   * Add a breadcrumb to track investigation steps
   * Can accept either a string or an object (for backward compatibility)
   */
  addBreadcrumb(step: string | { action: string; result?: string; timestamp?: Date }): void {
    if (typeof step === 'string') {
      const timestamp = new Date().toISOString();
      this.breadcrumbs.push(`[${timestamp}] ${step}`);
    } else {
      const timestamp = step.timestamp?.toISOString() || new Date().toISOString();
      const message = step.result ? `${step.action}: ${step.result}` : step.action;
      this.breadcrumbs.push(`[${timestamp}] ${message}`);
    }
  }

  /**
   * Get investigation summary for display
   */
  getSummary(): InvestigationSummary {
    return {
      id: this.id,
      goal: this.goal,
      duration: Date.now() - this.startedAt.getTime(),
      findingsCount: this.findings.length,
      breadcrumbs: this.breadcrumbs,
      findings: this.findings,
    };
  }

  /**
   * Get critical and high severity findings
   */
  getCriticalFindings(): Finding[] {
    return this.findings.filter(
      (f) => f.severity === "critical" || f.severity === "high"
    );
  }

  /**
   * Get findings by category
   */
  getFindingsByCategory(category: string): Finding[] {
    return this.findings.filter((f) => f.category === category);
  }
}
