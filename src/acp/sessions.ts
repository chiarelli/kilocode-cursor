import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";

export interface Session {
  id: string;
  cwd: string;
  modeId?: string;
  cancelled?: boolean;
  resumeId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionCreateOptions {
  cwd?: string;
  modeId?: string;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || join(process.cwd(), ".opencode", "sessions.json");
  }

  async initialize(): Promise<void> {
    // Load sessions from disk if storage file exists
    try {
      const data = await readFile(this.storagePath, "utf-8");
      const sessions = JSON.parse(data) as Record<string, Session>;
      this.sessions = new Map(Object.entries(sessions));
    } catch {
      // File doesn't exist or is invalid, start fresh
      this.sessions.clear();
    }
  }

  private async persist(): Promise<void> {
    // Save sessions to disk
    const dir = dirname(this.storagePath);
    await mkdir(dir, { recursive: true });
    const data = JSON.stringify(Object.fromEntries(this.sessions), null, 2);
    await writeFile(this.storagePath, data, "utf-8");
  }

  async createSession(options: SessionCreateOptions): Promise<Session> {
    const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const session: Session = {
      id,
      cwd: options.cwd || process.cwd(),
      modeId: options.modeId,
      cancelled: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.sessions.set(id, session);
    await this.persist();
    return session;
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessions.get(id) || null;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session, updates, { updatedAt: Date.now() });
      await this.persist();
    }
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
    await this.persist();
  }

  isCancelled(id: string): boolean {
    const session = this.sessions.get(id);
    return session?.cancelled || false;
  }

  markCancelled(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.cancelled = true;
      session.updatedAt = Date.now();
      this.persist().catch(() => {});
    }
  }

  canResume(id: string): boolean {
    const session = this.sessions.get(id);
    return !!session?.resumeId;
  }

  setResumeId(id: string, resumeId: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.resumeId = resumeId;
      session.updatedAt = Date.now();
      this.persist().catch(() => {});
    }
  }
}
