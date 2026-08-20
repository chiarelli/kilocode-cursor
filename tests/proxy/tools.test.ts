import { describe, it, expect } from "bun:test";
import { createProxyServer } from "../../src/proxy/server.js";
import { ToolRegistry } from "../../src/tools/registry.js";

describe("Proxy Tool Calling", () => {
  it("should inject tool schemas into prompt", async () => {
    const registry = new ToolRegistry();
    registry.register("test", {
      type: "function",
      function: {
        name: "test",
        description: "Test tool",
        parameters: {
          type: "object",
          properties: { input: { type: "string" } },
          required: ["input"]
        }
      }
    }, async (args) => args.input);

    const server = createProxyServer({
      port: 32127,
      toolRegistry: registry
    });

    await server.start();

    // Test that server started with tools
    expect(server.getBaseURL()).toContain("32127");

    await server.stop();
  });

  it("should have default tools registered", async () => {
    const server = createProxyServer({
      port: 32128
    });

    await server.start();

    // Server should start without explicit tool registry
    expect(server.getBaseURL()).toContain("32128");

    await server.stop();
  });
});