import { describe, it, expect } from "bun:test";
import { ToolRegistry } from "../../src/tools/registry.js";

describe("ToolRegistry", () => {
  it("should register and retrieve tools", () => {
    const registry = new ToolRegistry();

    registry.register("bash", {
      type: "function",
      function: {
        name: "bash",
        description: "Execute shell command",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" }
          },
          required: ["command"]
        }
      }
    }, async (args) => `Executed: ${args.command}`);

    const tool = registry.get("bash");
    expect(tool).toBeDefined();
    expect(tool?.definition.function.name).toBe("bash");
  });

  it("should return all tool definitions", () => {
    const registry = new ToolRegistry();
    registry.register("bash", {
      type: "function",
      function: {
        name: "bash",
        description: "Execute shell command",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" }
          },
          required: ["command"]
        }
      }
    }, async () => "");

    registry.register("read", {
      type: "function",
      function: {
        name: "read",
        description: "Read file contents",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" }
          },
          required: ["path"]
        }
      }
    }, async () => "");

    const definitions = registry.getAllDefinitions();
    expect(definitions).toHaveLength(2);
  });

  it("should check if tool exists", () => {
    const registry = new ToolRegistry();
    registry.register("bash", {
      type: "function",
      function: {
        name: "bash",
        description: "Execute shell command",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    }, async () => "");

    expect(registry.has("bash")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });
});