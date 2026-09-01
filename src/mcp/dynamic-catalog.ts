import { tool } from "@kilocode/plugin/tool";
import {
  discoverKiloNativeMcpToolDefs,
  isKiloMcpCatalogToolName,
  mcpCatalogAliasKey,
  resolveMcpToolName,
} from "./kilo-bridge.js";
import { namespaceMcpToolKilo } from "../kilo/platform.js";

export type McpCatalogEntry = {
  name: string;
  description: string;
};

let rememberedCatalog: McpCatalogEntry[] = [];

export const GET_DYNAMIC_TOOLS_NAME = "GetDynamicTools";

export function getRememberedMcpCatalog(): McpCatalogEntry[] {
  return rememberedCatalog;
}

export function resetRememberedMcpCatalog(): void {
  rememberedCatalog = [];
}

function preferCanonicalCatalogEntry(
  current: McpCatalogEntry | undefined,
  next: McpCatalogEntry,
): McpCatalogEntry {
  if (!current) {
    return next;
  }
  const currentHyphen = current.name.includes("-");
  const nextHyphen = next.name.includes("-");
  if (currentHyphen && !nextHyphen) {
    return next.description ? next : { ...next, description: current.description };
  }
  if (!currentHyphen && nextHyphen) {
    return current.description ? current : { ...current, description: next.description };
  }
  return next.description ? next : current;
}

function upsertCatalogEntry(
  byKey: Map<string, McpCatalogEntry>,
  entry: McpCatalogEntry,
): void {
  const key = mcpCatalogAliasKey(entry.name);
  byKey.set(key, preferCanonicalCatalogEntry(byKey.get(key), entry));
}

function sortCatalogEntries(entries: Iterable<McpCatalogEntry>): McpCatalogEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

/** Cache Kilo MCP names seen on the wire (proxy/chat.params), not only mcp.tool.list(). */
export function rememberMcpCatalogFromTools(tools: unknown): McpCatalogEntry[] {
  const next: McpCatalogEntry[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(tools) ? tools : [];

  for (const toolDef of list) {
    const fn = (toolDef as any)?.function ?? toolDef;
    const name = fn?.name;
    if (typeof name !== "string" || name.startsWith("mcp__")) {
      continue;
    }
    if (isGetDynamicToolsName(name) || isCallDynamicToolName(name)) {
      continue;
    }
    if (!isKiloMcpCatalogToolName(name)) {
      continue;
    }
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    next.push({
      name,
      description: String(fn?.description ?? "").trim(),
    });
  }

  if (next.length === 0) {
    return rememberedCatalog;
  }

  const byKey = new Map(rememberedCatalog.map((entry) => [mcpCatalogAliasKey(entry.name), entry]));
  for (const entry of next) {
    upsertCatalogEntry(byKey, entry);
  }
  rememberedCatalog = sortCatalogEntries(byKey.values());
  return rememberedCatalog;
}

export type ParsedDynamicToolArgs = {
  namespace?: string;
  toolName?: string;
  innerArgs: unknown;
};

export function getDynamicToolsDefinition(): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: GET_DYNAMIC_TOOLS_NAME,
      description:
        "List Kilo MCP tools by their Kilo-registered names (e.g. openviking_search, context7_query-docs). Native Cursor/Kilo filesystem tools are omitted. Optional namespace: \"kilo\" for MCP tools, \"cursor\" for Cursor native dynamic tools.",
      parameters: {
        type: "object",
        properties: {
          namespace: {
            type: "string",
            description: "kilo | cursor",
          },
        },
      },
    },
  };
}

export function isGetDynamicToolsName(name: string): boolean {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key === "getdynamictools" || key === "getmcptools";
}

export function isCallDynamicToolName(name: string): boolean {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return key === "calldynamictool" || key === "callmcptool" || key === "mcptoolcall";
}

export function parseCallDynamicToolArgs(args: unknown): ParsedDynamicToolArgs | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }
  const record = args as Record<string, unknown>;
  const namespace = pickString(record.namespace, record.providerIdentifier, record.server);
  const toolName = pickString(record.toolName, record.name, record.tool);
  const innerArgs = record.arguments ?? record.args ?? record.input ?? {};
  if (!namespace && !toolName) {
    return null;
  }
  return { namespace, toolName, innerArgs };
}

export function shouldPassthroughCursorDynamicTool(args: unknown): boolean {
  const parsed = parseCallDynamicToolArgs(args);
  if (!parsed) {
    return false;
  }
  if (parsed.namespace?.toLowerCase() === "cursor") {
    return true;
  }
  const key = (parsed.toolName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return key === "creategoal" || key === "generateimage" || key === "updategoal";
}

export function resolveCallDynamicToolToKiloName(
  args: unknown,
  allowedToolNames: Set<string>,
): { name: string; args: unknown } | null {
  if (shouldPassthroughCursorDynamicTool(args)) {
    return null;
  }
  const parsed = parseCallDynamicToolArgs(args);
  if (!parsed?.toolName) {
    return null;
  }

  const candidates = [parsed.toolName];
  if (parsed.namespace) {
    candidates.push(namespaceMcpToolKilo(parsed.namespace, parsed.toolName));
    candidates.push(`${parsed.namespace}_${parsed.toolName}`);
  }

  for (const candidate of candidates) {
    const resolved = resolveMcpToolName(candidate, allowedToolNames);
    if (resolved && !resolved.startsWith("mcp__")) {
      return { name: resolved, args: parsed.innerArgs };
    }
    if (allowedToolNames.has(candidate) && !candidate.startsWith("mcp__")) {
      return { name: candidate, args: parsed.innerArgs };
    }
  }

  return null;
}

export async function formatKiloMcpDynamicCatalog(
  client: any,
  namespace?: string,
): Promise<string> {
  const ns = String(namespace ?? "").trim().toLowerCase();
  if (ns === "cursor") {
    return [
      "Namespace: cursor (native Cursor dynamic tools — not Kilo MCP)",
      "- CreateGoal",
      "- GenerateImage",
      "- UpdateGoal",
      "Call these with CallDynamicTool { namespace: \"cursor\", toolName, arguments }.",
    ].join("\n");
  }

  const listed = await discoverKiloNativeMcpToolDefs(client);
  const byKey = new Map<string, McpCatalogEntry>();
  for (const entry of rememberedCatalog) {
    upsertCatalogEntry(byKey, entry);
  }
  for (const toolDef of listed) {
    const fn = toolDef?.function ?? toolDef;
    const name = String(fn?.name ?? "").trim();
    if (!name || name.startsWith("mcp__") || !isKiloMcpCatalogToolName(name)) {
      continue;
    }
    upsertCatalogEntry(byKey, {
      name,
      description: String(fn?.description ?? "").trim(),
    });
  }

  const tools = sortCatalogEntries(byKey.values());
  if (tools.length === 0) {
    return "No Kilo MCP tools are registered yet.";
  }

  const lines = [
    "Kilo MCP tools — invoke by these exact Kilo names (no mcp__ prefix):",
    ...tools.map((entry) => (
      entry.description ? `- ${entry.name} — ${entry.description}` : `- ${entry.name}`
    )),
    "",
    "Namespace cursor remains available via CallDynamicTool for CreateGoal, GenerateImage, UpdateGoal.",
  ];
  return lines.join("\n");
}

export function buildKiloMcpDiscoveryToolEntries(client: any): Record<string, any> {
  const z = tool.schema;
  return {
    [GET_DYNAMIC_TOOLS_NAME]: tool({
      description:
        "List Kilo MCP tools by their Kilo-registered names (e.g. openviking_search, context7_query-docs). Native Cursor/Kilo filesystem tools are omitted.",
      args: {
        namespace: z.string().optional().describe("kilo | cursor"),
      },
      async execute(args: any) {
        return formatKiloMcpDynamicCatalog(client, args?.namespace);
      },
    }),
  };
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
