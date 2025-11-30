/**
 * Session Manager
 * Manages investigation sessions with support for recursive sub-investigations
 */

import type {
  InvestigationSession,
  SessionFinding,
  InvestigationBreadcrumb,
  SessionQuery,
  ToolExecution,
  CreateSessionOptions,
  UpdateSessionOptions,
  SessionStorage,
  InvestigationTreeNode,
  SessionSearchOptions,
} from "./types.js";
import { FilesystemSessionStorage } from "./storage/filesystemStorage.js";

/**
 * Default session TTL (24 hours)
 */
const DEFAULT_SESSION_TTL = 24 * 60 * 60 * 1000;

/**
 * Default snapshot TTL (1 hour)
 */
const DEFAULT_SNAPSHOT_TTL = 60 * 60 * 1000;

/**
 * Maximum investigation depth (prevent infinite recursion)
 */
const MAX_INVESTIGATION_DEPTH = 5;

/**
 * Session Manager - manages investigation sessions
 */
export class SessionManager {
  private storage: SessionStorage;
  private sessionTtl: number;
  private snapshotTtl: number;

  constructor(options?: {
    storage?: SessionStorage;
    sessionTtl?: number;
    snapshotTtl?: number;
  }) {
    this.storage = options?.storage || new FilesystemSessionStorage();
    this.sessionTtl = options?.sessionTtl || DEFAULT_SESSION_TTL;
    this.snapshotTtl = options?.snapshotTtl || DEFAULT_SNAPSHOT_TTL;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `session-${timestamp}-${random}`;
  }

  /**
   * Create a new investigation session
   */
  async createSession(options: CreateSessionOptions): Promise<InvestigationSession> {
    // Check parent session if this is a sub-investigation
    let depth = 0;
    if (options.parentSessionId) {
      const parent = await this.getSession(options.parentSessionId);
      if (!parent) {
        throw new Error(`Parent session ${options.parentSessionId} not found`);
      }
      depth = parent.depth + 1;

      if (depth > MAX_INVESTIGATION_DEPTH) {
        throw new Error(
          `Maximum investigation depth (${MAX_INVESTIGATION_DEPTH}) exceeded. Cannot spawn sub-investigation.`
        );
      }

      // Update parent's child list
      parent.childSessionIds.push(this.generateSessionId());
      await this.storage.save(parent);
    }

    const now = new Date();
    const session: InvestigationSession = {
      id: this.generateSessionId(),
      userId: options.userId,
      startedAt: now,
      lastActivityAt: now,
      status: "active",
      hypothesis: options.hypothesis,
      goal: options.goal,
      findings: [],
      breadcrumbs: [],
      parentSessionId: options.parentSessionId,
      childSessionIds: [],
      depth,
      snapshots: new Map(),
      metrics: new Map(),
      logs: new Map(),
      queries: [],
      toolExecutions: [],
    };

    await this.storage.save(session);
    return session;
  }

  /**
   * Get an existing session
   */
  async getSession(sessionId: string): Promise<InvestigationSession | null> {
    return this.storage.load(sessionId);
  }

  /**
   * Update a session
   */
  async updateSession(
    sessionId: string,
    updates: UpdateSessionOptions
  ): Promise<InvestigationSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.lastActivityAt = new Date();

    // Apply updates
    if (updates.hypothesis !== undefined) {
      session.hypothesis = updates.hypothesis;
    }
    if (updates.goal !== undefined) {
      session.goal = updates.goal;
    }
    if (updates.status !== undefined) {
      session.status = updates.status;
    }
    if (updates.addFinding) {
      session.findings.push(updates.addFinding);
    }
    if (updates.addBreadcrumb) {
      session.breadcrumbs.push(updates.addBreadcrumb);
    }
    if (updates.addQuery) {
      session.queries.push(updates.addQuery);
    }
    if (updates.addToolExecution) {
      session.toolExecutions.push(updates.addToolExecution);
    }

    await this.storage.save(session);
    return session;
  }

  /**
   * Add a finding to a session
   */
  async addFinding(
    sessionId: string,
    finding: Omit<SessionFinding, "id" | "timestamp">
  ): Promise<SessionFinding> {
    const fullFinding: SessionFinding = {
      ...finding,
      id: `finding-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    };

    await this.updateSession(sessionId, { addFinding: fullFinding });
    return fullFinding;
  }

  /**
   * Add a breadcrumb to a session
   */
  async addBreadcrumb(
    sessionId: string,
    breadcrumb: Omit<InvestigationBreadcrumb, "timestamp">
  ): Promise<void> {
    const fullBreadcrumb: InvestigationBreadcrumb = {
      ...breadcrumb,
      timestamp: new Date(),
    };

    await this.updateSession(sessionId, { addBreadcrumb: fullBreadcrumb });
  }

  /**
   * Add a query to a session
   */
  async addQuery(
    sessionId: string,
    query: Omit<SessionQuery, "timestamp">
  ): Promise<void> {
    const fullQuery: SessionQuery = {
      ...query,
      timestamp: new Date(),
    };

    await this.updateSession(sessionId, { addQuery: fullQuery });
  }

  /**
   * Record a tool execution
   */
  async recordToolExecution(
    sessionId: string,
    execution: Omit<ToolExecution, "timestamp">
  ): Promise<void> {
    const fullExecution: ToolExecution = {
      ...execution,
      timestamp: new Date(),
    };

    await this.updateSession(sessionId, { addToolExecution: fullExecution });
  }

  /**
   * Spawn a sub-investigation (recursive thinking)
   */
  async spawnSubInvestigation(
    parentSessionId: string,
    options: {
      goal: string;
      hypothesis?: string;
    }
  ): Promise<InvestigationSession> {
    const parent = await this.getSession(parentSessionId);
    if (!parent) {
      throw new Error(`Parent session ${parentSessionId} not found`);
    }

    // Add breadcrumb to parent
    await this.addBreadcrumb(parentSessionId, {
      action: `Spawned sub-investigation: ${options.goal}`,
      result: "Sub-investigation started",
      nextSteps: ["Wait for sub-investigation results"],
    });

    // Create child session
    const childSession = await this.createSession({
      userId: parent.userId,
      parentSessionId,
      goal: options.goal,
      hypothesis: options.hypothesis,
    });

    return childSession;
  }

  /**
   * Complete a sub-investigation and merge findings to parent
   */
  async completeSubInvestigation(
    sessionId: string,
    summary: string
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Mark as completed
    session.status = "completed";
    await this.storage.save(session);

    // If has parent, merge findings
    if (session.parentSessionId) {
      const parent = await this.getSession(session.parentSessionId);
      if (parent) {
        // Add breadcrumb with results
        await this.addBreadcrumb(session.parentSessionId, {
          action: `Sub-investigation completed: ${session.goal}`,
          result: summary,
          nextSteps: session.breadcrumbs[session.breadcrumbs.length - 1]?.nextSteps,
        });

        // Merge critical findings to parent
        for (const finding of session.findings) {
          if (
            finding.category === "root-cause" ||
            finding.severity === "critical" ||
            finding.severity === "high"
          ) {
            await this.addFinding(session.parentSessionId, {
              ...finding,
              description: `[From sub-investigation: ${session.goal}] ${finding.description}`,
            });
          }
        }
      }
    }
  }

  /**
   * Get investigation tree
   */
  async getInvestigationTree(sessionId: string): Promise<InvestigationTreeNode> {
    return this.storage.getTree(sessionId);
  }

  /**
   * List sessions
   */
  async listSessions(options?: SessionSearchOptions): Promise<InvestigationSession[]> {
    return this.storage.list(options);
  }

  /**
   * Delete a session and all its children
   */
  async deleteSession(sessionId: string, recursive = true): Promise<void> {
    if (recursive) {
      const children = await this.storage.getChildren(sessionId);
      for (const child of children) {
        await this.deleteSession(child.id, true);
      }
    }

    await this.storage.delete(sessionId);
  }

  /**
   * Clean up old/expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - this.sessionTtl);
    const sessions = await this.storage.list();
    let cleaned = 0;

    for (const session of sessions) {
      if (session.lastActivityAt < cutoff && session.status !== "active") {
        await this.deleteSession(session.id, true);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get session context for tool execution
   */
  async getSessionContext(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      hypothesis: session.hypothesis,
      goal: session.goal,
      findings: session.findings,
      breadcrumbs: session.breadcrumbs,
      depth: session.depth,
    };
  }

  /**
   * Store a snapshot in a session
   */
  async storeSnapshot(
    sessionId: string,
    snapshotId: string,
    snapshot: any
  ): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.snapshots.set(snapshotId, {
      data: snapshot,
      timestamp: new Date(),
      ttl: this.snapshotTtl,
    });

    await this.storage.save(session);
  }

  /**
   * Get a snapshot from a session
   */
  async getSnapshot(sessionId: string, snapshotId: string): Promise<any | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const snapshot = session.snapshots.get(snapshotId);
    if (!snapshot) {
      return null;
    }

    // Check TTL
    const age = Date.now() - snapshot.timestamp.getTime();
    if (age > snapshot.ttl) {
      session.snapshots.delete(snapshotId);
      await this.storage.save(session);
      return null;
    }

    return snapshot.data;
  }
}
