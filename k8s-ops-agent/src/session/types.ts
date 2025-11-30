/**
 * Session Management Types
 * Supports investigation continuity and recursive deep thinking
 */

import type { ClusterSnapshot } from "../types.js";

/**
 * Investigation session - tracks an SRE's investigation journey
 */
export interface InvestigationSession {
  /** Unique session ID */
  id: string;
  /** User/SRE identifier */
  userId: string;
  /** When the investigation started */
  startedAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Session status */
  status: "active" | "paused" | "completed" | "abandoned";

  // Investigation context
  /** Current working hypothesis */
  hypothesis?: string;
  /** Investigation goal/question */
  goal?: string;
  /** All findings discovered so far */
  findings: SessionFinding[];
  /** Investigation trail (breadcrumbs) */
  breadcrumbs: InvestigationBreadcrumb[];

  // Recursive investigation tree
  /** Parent investigation session (if this is a sub-investigation) */
  parentSessionId?: string;
  /** Child sub-investigations spawned from this session */
  childSessionIds: string[];
  /** Depth in the investigation tree (0 = root) */
  depth: number;

  // Data cache with TTL
  /** Cached cluster snapshots by ID */
  snapshots: Map<
    string,
    {
      data: ClusterSnapshot;
      timestamp: Date;
      ttl: number; // milliseconds
    }
  >;

  /** Cached metrics queries */
  metrics: Map<
    string,
    {
      data: unknown; // MetricsQueryResult - will define when adding observability
      query: string;
      timestamp: Date;
    }
  >;

  /** Cached log queries */
  logs: Map<
    string,
    {
      data: unknown; // LogQueryResult - will define when adding observability
      query: string;
      timestamp: Date;
    }
  >;

  // Investigation history
  /** All queries/questions asked in this session */
  queries: SessionQuery[];
  /** Tools executed in this session */
  toolExecutions: ToolExecution[];
}

/**
 * A finding discovered during investigation
 */
export interface SessionFinding {
  /** Unique finding ID */
  id: string;
  /** When this was discovered */
  timestamp: Date;
  /** Category of finding */
  category: "root-cause" | "symptom" | "correlation" | "hypothesis" | "evidence" | "info";
  /** Severity/importance */
  severity: "critical" | "high" | "medium" | "low" | "info";
  /** Title/summary */
  title: string;
  /** Detailed description */
  description: string;
  /** Affected resource */
  resource?: {
    kind: string;
    name: string;
    namespace?: string;
  };
  /** Supporting evidence */
  evidence: {
    type: "snapshot" | "metric" | "log" | "event" | "tool-result";
    id: string;
    summary?: string;
  }[];
  /** Confidence level */
  confidence: "confirmed" | "high" | "medium" | "low" | "speculation";
  /** Suggested actions */
  suggestedActions?: string[];
  /** Related findings */
  relatedFindingIds?: string[];
}

/**
 * Breadcrumb - a step in the investigation trail
 */
export interface InvestigationBreadcrumb {
  /** Timestamp */
  timestamp: Date;
  /** What action was taken */
  action: string;
  /** What was discovered/result */
  result: string;
  /** Tool used (if any) */
  toolId?: string;
  /** AI-suggested next steps */
  nextSteps?: string[];
  /** Whether this led to a dead end */
  wasDeadEnd?: boolean;
}

/**
 * A query/question asked during investigation
 */
export interface SessionQuery {
  /** When asked */
  timestamp: Date;
  /** The question */
  query: string;
  /** Response summary */
  response?: string;
  /** Tools used to answer */
  toolsUsed: string[];
  /** Findings produced */
  findingIds: string[];
}

/**
 * Tool execution record
 */
export interface ToolExecution {
  /** Execution timestamp */
  timestamp: Date;
  /** Tool ID */
  toolId: string;
  /** Input parameters */
  params: unknown;
  /** Execution result */
  result?: unknown;
  /** Error if failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
  /** Whether this spawned a sub-investigation */
  spawnedSessionId?: string;
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  /** User identifier */
  userId: string;
  /** Investigation goal */
  goal?: string;
  /** Initial hypothesis */
  hypothesis?: string;
  /** Parent session ID (for sub-investigations) */
  parentSessionId?: string;
}

/**
 * Session update options
 */
export interface UpdateSessionOptions {
  /** Update hypothesis */
  hypothesis?: string;
  /** Update goal */
  goal?: string;
  /** Update status */
  status?: InvestigationSession["status"];
  /** Add finding */
  addFinding?: SessionFinding;
  /** Add breadcrumb */
  addBreadcrumb?: InvestigationBreadcrumb;
  /** Add query */
  addQuery?: SessionQuery;
  /** Add tool execution */
  addToolExecution?: ToolExecution;
}

/**
 * Session search/filter options
 */
export interface SessionSearchOptions {
  /** Filter by user */
  userId?: string;
  /** Filter by status */
  status?: InvestigationSession["status"];
  /** Filter by date range */
  startedAfter?: Date;
  startedBefore?: Date;
  /** Include child sessions */
  includeChildren?: boolean;
  /** Maximum depth to search */
  maxDepth?: number;
}

/**
 * Investigation tree node (for visualization)
 */
export interface InvestigationTreeNode {
  session: InvestigationSession;
  children: InvestigationTreeNode[];
  /** Summary of what this investigation discovered */
  summary?: string;
}

/**
 * Session storage interface (abstraction for different backends)
 */
export interface SessionStorage {
  /** Save a session */
  save(session: InvestigationSession): Promise<void>;
  /** Load a session */
  load(sessionId: string): Promise<InvestigationSession | null>;
  /** Delete a session */
  delete(sessionId: string): Promise<void>;
  /** List sessions matching criteria */
  list(options?: SessionSearchOptions): Promise<InvestigationSession[]>;
  /** Get all child sessions */
  getChildren(sessionId: string): Promise<InvestigationSession[]>;
  /** Get investigation tree */
  getTree(sessionId: string): Promise<InvestigationTreeNode>;
}
