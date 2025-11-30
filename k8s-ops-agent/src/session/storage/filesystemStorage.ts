/**
 * Filesystem-based session storage
 * Stores sessions as JSON files in .k8s-ops-sessions/
 */

import * as fs from "fs/promises";
import * as path from "path";
import type {
  InvestigationSession,
  SessionStorage,
  SessionSearchOptions,
  InvestigationTreeNode,
} from "../types.js";

/**
 * Default storage directory
 */
const DEFAULT_STORAGE_DIR = ".k8s-ops-sessions";

/**
 * Filesystem session storage implementation
 */
export class FilesystemSessionStorage implements SessionStorage {
  private storageDir: string;

  constructor(storageDir?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
  }

  /**
   * Initialize storage (create directory if needed)
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to initialize session storage: ${error}`);
    }
  }

  /**
   * Get file path for a session
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.storageDir, `${sessionId}.json`);
  }

  /**
   * Safe JSON replacer that handles circular references and BigInts
   */
  private jsonReplacer(seen: WeakSet<object>) {
    return (key: string, value: any): any => {
      // Handle BigInt
      if (typeof value === 'bigint') {
        return value.toString();
      }

      // Handle circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }

      return value;
    };
  }

  /**
   * Serialize session for storage
   * Converts Maps to objects and Dates to ISO strings
   */
  private serializeSession(session: InvestigationSession): string {
    const seen = new WeakSet();

    const serializable = {
      ...session,
      startedAt: session.startedAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      findings: session.findings.map((f) => ({
        ...f,
        timestamp: f.timestamp.toISOString(),
      })),
      breadcrumbs: session.breadcrumbs.map((b) => ({
        ...b,
        timestamp: b.timestamp.toISOString(),
      })),
      queries: session.queries.map((q) => ({
        ...q,
        timestamp: q.timestamp.toISOString(),
      })),
      toolExecutions: session.toolExecutions.map((t) => ({
        ...t,
        timestamp: t.timestamp.toISOString(),
      })),
      // Don't serialize full snapshot data - only metadata
      // Snapshots are huge and can cause serialization issues
      // They're stored separately in snapshotStore in-memory
      snapshots: Array.from(session.snapshots.entries()).map(([id, snap]) => ({
        id,
        // Only store metadata, not the full data
        timestamp: snap.timestamp.toISOString(),
        ttl: snap.ttl,
        // dataSize removed - JSON.stringify() on large data was causing corruption
      })),
      // Don't serialize large metric/log data - only metadata
      metrics: Array.from(session.metrics.entries()).map(([id, metric]) => ({
        id,
        query: metric.query,
        timestamp: metric.timestamp.toISOString(),
        // dataSize removed - JSON.stringify() on large data was causing corruption
      })),
      logs: Array.from(session.logs.entries()).map(([id, log]) => ({
        id,
        query: log.query,
        timestamp: log.timestamp.toISOString(),
        // dataSize removed - JSON.stringify() on large data was causing corruption
      })),
    };

    return JSON.stringify(serializable, this.jsonReplacer(seen), 2);
  }

  /**
   * Deserialize session from storage
   * Converts objects back to Maps and ISO strings to Dates
   */
  private deserializeSession(data: string): InvestigationSession {
    const parsed = JSON.parse(data);

    return {
      ...parsed,
      startedAt: new Date(parsed.startedAt),
      lastActivityAt: new Date(parsed.lastActivityAt),
      findings: parsed.findings.map((f: any) => ({
        ...f,
        timestamp: new Date(f.timestamp),
      })),
      breadcrumbs: parsed.breadcrumbs.map((b: any) => ({
        ...b,
        timestamp: new Date(b.timestamp),
      })),
      queries: parsed.queries.map((q: any) => ({
        ...q,
        timestamp: new Date(q.timestamp),
      })),
      toolExecutions: parsed.toolExecutions.map((t: any) => ({
        ...t,
        timestamp: new Date(t.timestamp),
      })),
      // Snapshots are not persisted in session files anymore
      // They're kept in-memory in snapshotStore
      // We only deserialize metadata here
      snapshots: new Map(
        parsed.snapshots.map((snap: any) => [
          snap.id,
          {
            data: snap.data || {}, // Data not persisted, will be empty on load
            timestamp: new Date(snap.timestamp),
            ttl: snap.ttl,
          },
        ])
      ),
      // Metrics/logs data not persisted, only metadata
      metrics: new Map(
        parsed.metrics.map((metric: any) => [
          metric.id,
          {
            data: metric.data || {}, // Data not persisted
            query: metric.query,
            timestamp: new Date(metric.timestamp),
          },
        ])
      ),
      logs: new Map(
        parsed.logs.map((log: any) => [
          log.id,
          {
            data: log.data || {}, // Data not persisted
            query: log.query,
            timestamp: new Date(log.timestamp),
          },
        ])
      ),
    };
  }

  /**
   * Save a session
   */
  async save(session: InvestigationSession): Promise<void> {
    await this.initialize();
    const filePath = this.getSessionPath(session.id);
    const data = this.serializeSession(session);

    try {
      await fs.writeFile(filePath, data, "utf-8");
    } catch (error) {
      throw new Error(`Failed to save session ${session.id}: ${error}`);
    }
  }

  /**
   * Load a session
   */
  async load(sessionId: string): Promise<InvestigationSession | null> {
    const filePath = this.getSessionPath(sessionId);

    try {
      const data = await fs.readFile(filePath, "utf-8");
      return this.deserializeSession(data);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return null; // Session not found
      }
      throw new Error(`Failed to load session ${sessionId}: ${error}`);
    }
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<void> {
    const filePath = this.getSessionPath(sessionId);

    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        throw new Error(`Failed to delete session ${sessionId}: ${error}`);
      }
    }
  }

  /**
   * List all session files
   */
  private async listSessionFiles(): Promise<string[]> {
    try {
      await this.initialize();
      const files = await fs.readdir(this.storageDir);
      return files.filter((f) => f.endsWith(".json"));
    } catch (error) {
      return [];
    }
  }

  /**
   * List sessions matching criteria
   */
  async list(options?: SessionSearchOptions): Promise<InvestigationSession[]> {
    const files = await this.listSessionFiles();
    const sessions: InvestigationSession[] = [];

    for (const file of files) {
      const sessionId = file.replace(".json", "");
      const session = await this.load(sessionId);
      if (!session) continue;

      // Apply filters
      if (options?.userId && session.userId !== options.userId) continue;
      if (options?.status && session.status !== options.status) continue;
      if (options?.startedAfter && session.startedAt < options.startedAfter) continue;
      if (options?.startedBefore && session.startedAt > options.startedBefore) continue;
      if (options?.maxDepth !== undefined && session.depth > options.maxDepth) continue;

      sessions.push(session);
    }

    return sessions;
  }

  /**
   * Get all child sessions
   */
  async getChildren(sessionId: string): Promise<InvestigationSession[]> {
    const allSessions = await this.list();
    return allSessions.filter((s) => s.parentSessionId === sessionId);
  }

  /**
   * Get investigation tree
   */
  async getTree(sessionId: string): Promise<InvestigationTreeNode> {
    const session = await this.load(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const children = await this.getChildren(sessionId);
    const childNodes = await Promise.all(
      children.map((child) => this.getTree(child.id))
    );

    return {
      session,
      children: childNodes,
      summary: this.generateSessionSummary(session),
    };
  }

  /**
   * Generate a summary of session findings
   */
  private generateSessionSummary(session: InvestigationSession): string {
    const findings = session.findings.filter((f) => f.category === "root-cause");
    if (findings.length > 0) {
      return findings.map((f) => f.title).join("; ");
    }

    if (session.hypothesis) {
      return `Hypothesis: ${session.hypothesis}`;
    }

    if (session.goal) {
      return session.goal;
    }

    return `${session.findings.length} findings, ${session.toolExecutions.length} tools executed`;
  }

  /**
   * Clean up expired snapshots across all sessions
   */
  async cleanupExpiredSnapshots(): Promise<void> {
    const sessions = await this.list();
    const now = Date.now();

    for (const session of sessions) {
      let modified = false;

      for (const [snapshotId, snapshot] of session.snapshots.entries()) {
        const age = now - snapshot.timestamp.getTime();
        if (age > snapshot.ttl) {
          session.snapshots.delete(snapshotId);
          modified = true;
        }
      }

      if (modified) {
        await this.save(session);
      }
    }
  }
}
