/**
 * Passthrough MCP bridge: Kilo owns MCP registration and execution.
 *
 * cursor-agent emits `mcp__<server>__<tool>` (or a generic `mcp` wrapper).
 * Kilo exposes the same tools as `<server>_<tool>` (e.g. context7_resolve-library-id).
 * The proxy only maps names on the way back — no separate MCP client or reload.
 */
import { namespaceMcpTool } from "./tool-bridge.js";

const KILO_NATIVE_UNDERSCORE_TOOLS = new Set([
  "list_mcp_resources",
  "read_mcp_resource",
  "list_mcp_resource_templates",
  "skill_mcp",
  "call_omo_agent",
]);

/** Underscore tools whose first segment looks like an MCP server but are Kilo/OpenViking natives. */
const KILO_NATIVE_CATALOG_SERVERS = new Set([
  "agent",
  "background",
  "kilo",
  "viking",
]);

/** Split a Kilo MCP function name into server + tool segments. */
export function splitKiloMcpToolName(name: string): { server: string; toolName: string } | null {
  if (!/^[a-zA-Z0-9]+_[a-zA-Z0-9_.-]+$/.test(name)) {
    return null;
  }
  if (name.startsWith("oc_") || name.startsWith("mcp__")) {
    return null;
  }
  if (KILO_NATIVE_UNDERSCORE_TOOLS.has(name.toLowerCase())) {
    return null;
  }

  const firstUnderscore = name.indexOf("_");
  const server = name.slice(0, firstUnderscore);
  const toolName = name.slice(firstUnderscore + 1);
  if (!server || !toolName) {
    return null;
  }
  return { server, toolName };
}

export function isKiloMcpToolName(name: string): boolean {
  return splitKiloMcpToolName(name) !== null;
}

/** Visible GetDynamicTools catalog: real MCP servers only, not Kilo/OpenViking natives. */
export function isKiloMcpCatalogToolName(name: string): boolean {
  const split = splitKiloMcpToolName(name);
  if (!split) {
    return false;
  }
  return !KILO_NATIVE_CATALOG_SERVERS.has(split.server.toLowerCase());
}

export function mcpCatalogAliasKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Map cursor-agent MCP names back to the Kilo tool name from the request allowlist. */
export function resolveMcpToolName(name: string, allowedToolNames: Set<string>): string | null {
  if (!name.startsWith("mcp__")) {
    return allowedToolNames.has(name) ? name : null;
  }

  const rest = name.slice("mcp__".length);
  const parts = rest.split("__");
  const candidates: string[] = [];

  if (parts.length >= 2) {
    candidates.push(parts.join("_"));
    candidates.push(parts.join("."));
    candidates.push(parts[parts.length - 1]!);
  }
  candidates.push(rest);

  const normalizedAllowed = new Map<string, string>();
  for (const allowed of allowedToolNames) {
    normalizedAllowed.set(normalizeToolAliasKey(allowed), allowed);
  }

  for (const candidate of candidates) {
    if (allowedToolNames.has(candidate) && !candidate.startsWith("mcp__")) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    const match = normalizedAllowed.get(normalizeToolAliasKey(candidate));
    if (match && !match.startsWith("mcp__")) {
      return match;
    }
  }

  if (allowedToolNames.has(name)) {
    return name;
  }

  for (const candidate of candidates) {
    if (allowedToolNames.has(candidate)) {
      return candidate;
    }
  }

  for (const candidate of candidates) {
    const match = normalizedAllowed.get(normalizeToolAliasKey(candidate));
    if (match) {
      return match;
    }
  }

  return null;
}

function normalizeToolAliasKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractFunctionToolNames(tools: Array<any>): string[] {
  const names: string[] = [];
  for (const tool of tools) {
    const fn = tool?.function ?? tool;
    const name = fn?.name;
    if (typeof name === "string" && name.length > 0) {
      names.push(name);
    }
  }
  return names;
}

/** Drop `mcp__*` aliases from the visible catalog; Kilo names stay as registered. */
export function stripVisibleMcpPrefixTools(tools: Array<any>): Array<any> {
  if (!Array.isArray(tools) || tools.length === 0) {
    return tools;
  }
  return tools.filter((tool) => {
    const name = (tool?.function ?? tool)?.name;
    return typeof name !== "string" || !name.startsWith("mcp__");
  });
}

/**
 * When two names differ only by hyphen/underscore, keep the Kilo-registered
 * canonical name from `preferNames` (usually `mcp.tool.list()`).
 */
export function preferCanonicalMcpNames(tools: Array<any>, preferNames: string[]): Array<any> {
  const preferredByKey = new Map<string, string>();
  for (const name of preferNames) {
    if (name.startsWith("mcp__")) {
      continue;
    }
    preferredByKey.set(normalizeToolAliasKey(name), name);
  }

  const seen = new Set<string>();
  const kept: Array<any> = [];
  for (const tool of tools) {
    const name = (tool?.function ?? tool)?.name;
    if (typeof name !== "string" || name.startsWith("mcp__")) {
      continue;
    }
    const key = normalizeToolAliasKey(name);
    const preferred = preferredByKey.get(key);
    if (preferred && name !== preferred) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(tool);
  }
  return kept;
}

/** @deprecated Visible mcp__ aliases are no longer injected. Keep as identity for callers. */
export function enrichKiloToolsWithMcpAliases(tools: Array<any>): Array<any> {
  return stripVisibleMcpPrefixTools(tools);
}

/** Allowlist for interception: Kilo names plus hidden mcp__ aliases for remapping. */
export function buildProxyAllowedToolNames(tools: Array<any>): Set<string> {
  const names = new Set(extractFunctionToolNames(tools));
  names.add("GetDynamicTools");

  for (const name of names) {
    const split = splitKiloMcpToolName(name);
    if (split) {
      names.add(namespaceMcpTool(split.server, split.toolName));
    }
  }

  return names;
}

export function isCursorMcpMetaTool(rawName: string): boolean {
  let key = rawName.toLowerCase().replace(/[_-]/g, "");
  if (key.endsWith("toolcall")) {
    key = key.slice(0, -"toolcall".length);
  }
  if (key.endsWith("tool") && key !== "mcp") {
    key = key.slice(0, -"tool".length);
  }
  return key === "mcp" || key === "callmcp";
}

export function remapBareMcpToolCall(
  args: unknown,
  allowedToolNames: Set<string>,
): { name: string; args: unknown } | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }

  const record = args as Record<string, unknown>;
  const provider = record.providerIdentifier ?? record.server;
  const toolName = record.toolName ?? record.name;
  if (typeof provider !== "string" || typeof toolName !== "string") {
    return null;
  }

  const virtualName = namespaceMcpTool(provider, toolName);
  const resolved = resolveMcpToolName(virtualName, allowedToolNames);
  if (!resolved) {
    return null;
  }

  return {
    name: resolved,
    args: record.args ?? record.arguments ?? {},
  };
}

export function mergeToolDefinitionsByName(base: Array<any>, extra: Array<any>): Array<any> {
  const merged = Array.isArray(base) ? [...base] : [];
  const names = new Set(extractFunctionToolNames(merged));

  for (const tool of extra) {
    const name = tool?.function?.name;
    if (typeof name === "string" && name.length > 0 && !names.has(name)) {
      names.add(name);
      merged.push(tool);
    }
  }

  return merged;
}

/** Pull native Kilo MCP tool defs (context7_*, etc.) from the running Kilo server. */
export async function discoverKiloNativeMcpToolDefs(client: any): Promise<Array<any>> {
  try {
    const mcpList = client?.mcp?.tool?.list ? await client.mcp.tool.list() : null;
    const tools = mcpList?.data?.tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      return [];
    }

    return tools
      .map((tool: any) => {
        const name = String(tool.name || tool.id || "").trim();
        if (!name) {
          return null;
        }
        return {
          type: "function",
          function: {
            name,
            description: String(tool.description || `Kilo MCP tool ${name}`),
            parameters: tool.parameters
              ?? tool.inputSchema
              ?? { type: "object", properties: {} },
          },
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function buildKiloMcpAliasHint(toolNames: string[]): string | null {
  const lines = [...new Set(toolNames.filter((name) => isKiloMcpToolName(name) && !name.startsWith("mcp__")))]
    .sort()
    .map((clientName) => `  - ${clientName}`);

  if (lines.length === 0) {
    return null;
  }

  return [
    "Kilo MCP tools (executed by Kilo). Invoke by the Kilo name exactly — no mcp__ prefix.",
    "GetDynamicTools lists this same catalog. Native Cursor tools stay in namespace \"cursor\".",
    ...lines,
  ].join("\n");
}

export function isCursorNativeMcpDiscoveryTool(name: string): boolean {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key === "getmcptools" || key === "callmcptool" || key === "mcptoolcall";
}
