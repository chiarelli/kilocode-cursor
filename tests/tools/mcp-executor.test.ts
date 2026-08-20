// tests/tools/mcp-executor.test.ts
import { describe, it, expect } from "bun:test";
import { McpExecutor } from "../../src/tools/executors/mcp.js";

describe("McpExecutor", () => {
  it("canExecute returns false when toolIds is empty", () => {
    const mockClient = { mcp: { tool: { invoke: async () => "ok" } } };
    const exec = new McpExecutor(mockClient, 5000);
    expect(exec.canExecute("any_tool")).toBe(false);
  });

  it("canExecute returns true after setToolIds", () => {
    const mockClient = { mcp: { tool: { invoke: async () => "ok" } } };
    const exec = new McpExecutor(mockClient, 5000);
    exec.setToolIds(["tool_a", "tool_b"]);
    expect(exec.canExecute("tool_a")).toBe(true);
    expect(exec.canExecute("unknown")).toBe(false);
  });

  it("executes and returns success", async () => {
    const mockClient = { mcp: { tool: { invoke: async (_id: string, _args: any) => "result data" } } };
    const exec = new McpExecutor(mockClient, 5000);
    exec.setToolIds(["tool_a"]);

    const result = await exec.execute("tool_a", { key: "val" });
    expect(result.status).toBe("success");
    expect(result.output).toBe("result data");
  });

  it("returns error when client unavailable", async () => {
    const exec = new McpExecutor(null, 5000);
    exec.setToolIds(["tool_a"]);

    const result = await exec.execute("tool_a", {});
    expect(result.status).toBe("error");
  });
});
