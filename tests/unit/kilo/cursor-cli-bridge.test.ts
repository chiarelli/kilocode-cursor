import { describe, expect, it } from "bun:test";
import { isDirectMcpEnabled, KILO_PASSTHROUGH_BRIDGE_CLI_CONFIG } from "../../../src/kilo/cursor-cli-bridge.js";

describe("kilo/cursor-cli-bridge", () => {
  it("enables direct MCP by default", () => {
    expect(isDirectMcpEnabled({})).toBe(true);
  });

  it("disables direct MCP when CURSOR_KILO_DIRECT_MCP=false", () => {
    expect(isDirectMcpEnabled({ CURSOR_KILO_DIRECT_MCP: "false" })).toBe(false);
  });

  it("honors legacy CURSOR_KILO_MCP_BRIDGE=false", () => {
    expect(isDirectMcpEnabled({ CURSOR_KILO_MCP_BRIDGE: "false" })).toBe(false);
  });

  it("prefers CURSOR_KILO_DIRECT_MCP over legacy flag", () => {
    expect(
      isDirectMcpEnabled({
        CURSOR_KILO_DIRECT_MCP: "true",
        CURSOR_KILO_MCP_BRIDGE: "false",
      }),
    ).toBe(true);
  });

  it("writes valid cli.json with permissions.allow array", () => {
    expect(KILO_PASSTHROUGH_BRIDGE_CLI_CONFIG.version).toBe(1);
    expect(Array.isArray(KILO_PASSTHROUGH_BRIDGE_CLI_CONFIG.permissions.allow)).toBe(true);
    expect(KILO_PASSTHROUGH_BRIDGE_CLI_CONFIG).not.toHaveProperty("approvalMode");
  });
});
