/**
 * Investigation Types
 * Lightweight types for in-memory investigation tracking
 */

/**
 * Finding from analysis tools
 */
export interface Finding {
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  suggestedAction?: string;
  evidence?: Record<string, unknown>;
}

/**
 * Investigation summary for display
 */
export interface InvestigationSummary {
  id: string;
  goal: string;
  duration: number;
  findingsCount: number;
  breadcrumbs: string[];
  findings: Finding[];
}
