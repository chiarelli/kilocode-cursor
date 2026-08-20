import { describe, it, expect } from "bun:test";
import { SdkExecutor } from "../../src/tools/executors/sdk.js";

describe("SdkExecutor", () => {
  it("should return false for canExecute when no client", () => {
    const exec = new SdkExecutor(null, 5000);
    expect(exec.canExecute("any-tool")).toBe(false);
  });

  it("should return false for canExecute when client lacks tool.invoke", () => {
    const exec = new SdkExecutor({}, 5000);
    expect(exec.canExecute("any-tool")).toBe(false);
  });

  it("should return false for canExecute when toolId not registered", () => {
    const client = { tool: { invoke: async () => "ok" } };
    const exec = new SdkExecutor(client, 5000);
    // No tool IDs set — should reject
    expect(exec.canExecute("unknown-tool")).toBe(false);
  });

  it("should return true for canExecute when toolId is registered", () => {
    const client = { tool: { invoke: async () => "ok" } };
    const exec = new SdkExecutor(client, 5000);
    exec.setToolIds(["my-tool", "other-tool"]);
    expect(exec.canExecute("my-tool")).toBe(true);
    expect(exec.canExecute("other-tool")).toBe(true);
    expect(exec.canExecute("nope")).toBe(false);
  });

  it("should execute and return string output", async () => {
    const client = { tool: { invoke: async (_id: string, _args: any) => "hello world" } };
    const exec = new SdkExecutor(client, 5000);
    exec.setToolIds(["test-tool"]);

    const result = await exec.execute("test-tool", {});
    expect(result.status).toBe("success");
    expect(result.output).toBe("hello world");
  });

  it("should JSON-stringify non-string output", async () => {
    const client = { tool: { invoke: async () => ({ key: "value" }) } };
    const exec = new SdkExecutor(client, 5000);
    exec.setToolIds(["test-tool"]);

    const result = await exec.execute("test-tool", {});
    expect(result.status).toBe("success");
    expect(result.output).toBe('{"key":"value"}');
  });

  it("should return error when invoke throws", async () => {
    const client = { tool: { invoke: async () => { throw new Error("sdk failure"); } } };
    const exec = new SdkExecutor(client, 5000);
    exec.setToolIds(["test-tool"]);

    const result = await exec.execute("test-tool", {});
    expect(result.status).toBe("error");
    expect(result.error).toContain("sdk failure");
  });

  it("should return error on timeout", async () => {
    const client = {
      tool: {
        invoke: async () => new Promise((resolve) => setTimeout(() => resolve("late"), 10000))
      }
    };
    const exec = new SdkExecutor(client, 50); // 50ms timeout
    exec.setToolIds(["test-tool"]);

    const result = await exec.execute("test-tool", {});
    expect(result.status).toBe("error");
    expect(result.error).toContain("timeout");
  });

  it("should return error when canExecute is false", async () => {
    const exec = new SdkExecutor(null, 5000);
    const result = await exec.execute("any-tool", {});
    expect(result.status).toBe("error");
    expect(result.error).toContain("unavailable");
  });
});
