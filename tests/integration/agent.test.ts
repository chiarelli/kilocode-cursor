import { describe, it, expect, beforeAll } from "bun:test";
import { SimpleCursorClient } from "../../src/client/simple.js";

describe("CursorAgent Integration", () => {
  let client: SimpleCursorClient;

  beforeAll(() => {
    client = new SimpleCursorClient({
      cursorAgentPath: process.env.CURSOR_AGENT_EXECUTABLE || 'cursor-agent'
    });
  });

  it("should initialize client with config", () => {
    expect(client).toBeDefined();
  });

  it("should list available models", async () => {
    const models = await client.getAvailableModels();
    expect(models).toBeDefined();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
  });

  it("should validate installation (may timeout without cursor-agent)", async () => {
    // Create a client with a very short timeout to avoid hanging
    const testClient = new SimpleCursorClient({
      cursorAgentPath: 'cursor-agent',
      timeout: 100 // 100ms timeout to quickly fail
    });

    // Should return false or boolean without throwing
    const isValid = await testClient.validateInstallation();
    expect(typeof isValid).toBe('boolean');
  }, { timeout: 2000 }); // 2 second test timeout
});
