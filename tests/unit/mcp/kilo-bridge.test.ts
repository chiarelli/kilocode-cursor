import { describe, expect, it } from "bun:test";
import {
  buildKiloMcpAliasHint,
  buildProxyAllowedToolNames,
  enrichKiloToolsWithMcpAliases,
  isCursorNativeMcpDiscoveryTool,
  isKiloMcpCatalogToolName,
  isKiloMcpToolName,
  mcpCatalogAliasKey,
  remapBareMcpToolCall,
  resolveMcpToolName,
  splitKiloMcpToolName,
} from "../../../src/mcp/kilo-bridge.js";

describe("mcp/kilo-bridge", () => {
  it("splits Kilo MCP function names into server and tool", () => {
    expect(splitKiloMcpToolName("context7_resolve-library-id")).toEqual({
      server: "context7",
      toolName: "resolve-library-id",
    });
    expect(splitKiloMcpToolName("context7_get_docs")).toEqual({
      server: "context7",
      toolName: "get_docs",
    });
  });

  it("does not treat native Kilo tools as MCP splits", () => {
    expect(splitKiloMcpToolName("list_mcp_resources")).toBeNull();
    expect(splitKiloMcpToolName("skill_mcp")).toBeNull();
    expect(splitKiloMcpToolName("read")).toBeNull();
  });

  it("keeps natives and viking wrappers out of the GetDynamicTools catalog", () => {
    expect(isKiloMcpCatalogToolName("openviking_search")).toBe(true);
    expect(isKiloMcpCatalogToolName("context7_query-docs")).toBe(true);
    expect(isKiloMcpCatalogToolName("agent_manager")).toBe(false);
    expect(isKiloMcpCatalogToolName("background_process")).toBe(false);
    expect(isKiloMcpCatalogToolName("kilo_local_recall")).toBe(false);
    expect(isKiloMcpCatalogToolName("viking_search")).toBe(false);
    expect(mcpCatalogAliasKey("context7_query-docs")).toBe(mcpCatalogAliasKey("context7_query_docs"));
  });

  it("maps cursor-agent mcp__ names back to Kilo names", () => {
    const allowed = new Set(["context7_resolve-library-id", "read"]);
    expect(resolveMcpToolName("mcp__context7__resolve_library_id", allowed)).toBe(
      "context7_resolve-library-id",
    );
    expect(resolveMcpToolName("mcp__context7__get_docs", new Set(["context7_get_docs"]))).toBe(
      "context7_get_docs",
    );
  });

  it("does not add mcp__ aliases to the visible catalog", () => {
    const tools = [
      {
        type: "function",
        function: {
          name: "context7_get_docs",
          description: "Fetch docs",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        },
      },
    ];

    const enriched = enrichKiloToolsWithMcpAliases(tools);
    const names = enriched.map((t) => t.function.name);
    expect(names).toContain("context7_get_docs");
    expect(names.some((name) => name.startsWith("mcp__"))).toBe(false);
  });

  it("builds proxy allowlist with both Kilo and cursor-agent MCP names", () => {
    const allowed = buildProxyAllowedToolNames([
      { function: { name: "context7_search" } },
      { function: { name: "read" } },
    ]);

    expect(allowed.has("context7_search")).toBe(true);
    expect(allowed.has("mcp__context7__search")).toBe(true);
    expect(allowed.has("GetDynamicTools")).toBe(true);
  });

  it("remaps bare mcp wrapper calls to the Kilo tool name", () => {
    const allowed = buildProxyAllowedToolNames([
      { function: { name: "context7_search" } },
    ]);

    const remapped = remapBareMcpToolCall(
      { providerIdentifier: "context7", toolName: "search", args: { q: "react" } },
      allowed,
    );

    expect(remapped).toEqual({
      name: "context7_search",
      args: { q: "react" },
    });
  });

  it("builds alias hint for system prompt", () => {
    const hint = buildKiloMcpAliasHint(["read", "context7_search", "bash"]);
    expect(hint).toContain("context7_search");
    expect(hint).toContain("GetDynamicTools");
    expect(isKiloMcpToolName("context7_search")).toBe(true);
  });

  it("detects cursor native MCP discovery tools", () => {
    expect(isCursorNativeMcpDiscoveryTool("GetMcpTools")).toBe(true);
    expect(isCursorNativeMcpDiscoveryTool("CallMcpTool")).toBe(true);
    expect(isCursorNativeMcpDiscoveryTool("context7_search")).toBe(false);
  });
});
