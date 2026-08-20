import { describe, it, expect, beforeEach } from "bun:test";
import { SessionManager } from "../../src/acp/sessions.js";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(async () => {
    manager = new SessionManager();
    await manager.initialize();
  });

  it("should create session with unique ID", async () => {
    const session = await manager.createSession({ cwd: "/tmp" });
    expect(session.id).toBeDefined();
    expect(typeof session.id).toBe("string");
    expect(session.id.length).toBeGreaterThan(0);
  });

  it("should persist session to disk", async () => {
    const session = await manager.createSession({ cwd: "/tmp", modeId: "plan" });
    
    const newManager = new SessionManager();
    await newManager.initialize();
    
    const loaded = await newManager.getSession(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.cwd).toBe("/tmp");
    expect(loaded?.modeId).toBe("plan");
  });

  it("should update session state", async () => {
    const session = await manager.createSession({ cwd: "/tmp" });
    
    await manager.updateSession(session.id, { modeId: "plan" });
    
    const updated = await manager.getSession(session.id);
    expect(updated?.modeId).toBe("plan");
  });

  it("should handle cancel state", async () => {
    const session = await manager.createSession({});
    
    expect(manager.isCancelled(session.id)).toBe(false);
    
    manager.markCancelled(session.id);
    
    expect(manager.isCancelled(session.id)).toBe(true);
  });

  it("should handle resume ID", async () => {
    const session = await manager.createSession({});
    
    expect(manager.canResume(session.id)).toBe(false);
    
    manager.setResumeId(session.id, "resume-123");
    
    expect(manager.canResume(session.id)).toBe(true);
  });

  it("should delete session", async () => {
    const session = await manager.createSession({});
    
    await manager.deleteSession(session.id);
    
    const deleted = await manager.getSession(session.id);
    expect(deleted).toBeNull();
  });
});
