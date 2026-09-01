import { describe, expect, it } from "bun:test";
import {
  formatKiloMcpDynamicCatalog,
  getRememberedMcpCatalog,
  isCallDynamicToolName,
  isGetDynamicToolsName,
  parseCallDynamicToolArgs,
  rememberMcpCatalogFromTools,
  resetRememberedMcpCatalog,
  resolveCallDynamicToolToKiloName,
  shouldPassthroughCursorDynamicTool,
} from "../../../src/mcp/dynamic-catalog.js";

describe("mcp/dynamic-catalog", () => {
  it("detects GetDynamicTools and GetMcpTools catalog names", () => {
    expect(isGetDynamicToolsName("GetDynamicTools")).toBe(true);
    expect(isGetDynamicToolsName("GetMcpTools")).toBe(true);
    expect(isGetDynamicToolsName("openviking_search")).toBe(false);
  });

  it("passthroughs cursor namespace dynamic tools", () => {
    expect(shouldPassthroughCursorDynamicTool({
      namespace: "cursor",
      toolName: "CreateGoal",
      arguments: { title: "x" },
    })).toBe(true);
    expect(shouldPassthroughCursorDynamicTool({
      namespace: "kilo",
      toolName: "openviking_search",
      arguments: { query: "q" },
    })).toBe(false);
  });

  it("resolves CallDynamicTool args to the Kilo MCP name", () => {
    const allowed = new Set(["openviking_search", "context7_query-docs"]);
    expect(resolveCallDynamicToolToKiloName(
      { namespace: "openviking", toolName: "search", arguments: { query: "q" } },
      allowed,
    )).toEqual({ name: "openviking_search", args: { query: "q" } });
    expect(parseCallDynamicToolArgs({
      providerIdentifier: "context7",
      toolName: "query-docs",
      args: { library: "react" },
    })).toEqual({
      namespace: "context7",
      toolName: "query-docs",
      innerArgs: { library: "react" },
    });
    expect(isCallDynamicToolName("CallDynamicTool")).toBe(true);
  });

  it("remembers Kilo MCP names from request tools when mcp.tool.list is empty", async () => {
    resetRememberedMcpCatalog();
    rememberMcpCatalogFromTools([
      { function: { name: "read", description: "read file" } },
      { function: { name: "openviking_search", description: "semantic search" } },
      { function: { name: "mcp__openviking__search", description: "alias" } },
      { function: { name: "context7_query-docs", description: "docs" } },
    ]);
    expect(getRememberedMcpCatalog().map((entry) => entry.name)).toEqual([
      "context7_query-docs",
      "openviking_search",
    ]);

    const text = await formatKiloMcpDynamicCatalog({ mcp: { tool: { list: async () => ({ data: { tools: [] } }) } } });
    expect(text).toContain("openviking_search");
    expect(text).toContain("context7_query-docs");
    expect(text).not.toContain("mcp__openviking__search");
    expect(text).not.toContain("- read");
  });

  it("omits Kilo natives and viking wrappers, and collapses hyphen/underscore aliases", async () => {
    resetRememberedMcpCatalog();
    rememberMcpCatalogFromTools([
      { function: { name: "agent_manager", description: "agent manager" } },
      { function: { name: "agent_manager_models", description: "models" } },
      { function: { name: "background_process", description: "bg" } },
      { function: { name: "kilo_local_recall", description: "recall" } },
      { function: { name: "viking_search", description: "legacy wrapper" } },
      { function: { name: "context7_query-docs", description: "hyphen docs" } },
      { function: { name: "context7_query_docs", description: "underscore docs" } },
      { function: { name: "openviking_search", description: "search" } },
    ]);

    const names = getRememberedMcpCatalog().map((entry) => entry.name);
    expect(names).toEqual(["context7_query_docs", "openviking_search"]);

    const text = await formatKiloMcpDynamicCatalog({ mcp: { tool: { list: async () => ({ data: { tools: [] } }) } } });
    expect(text).toContain("- openviking_search");
    expect(text).toContain("- context7_query_docs");
    expect(text).not.toContain("context7_query-docs");
    expect(text).not.toContain("- agent_manager");
    expect(text).not.toContain("- viking_search");
    expect(text).not.toContain("- kilo_local_recall");
    expect(text).not.toContain("- background_process");
  });
});
