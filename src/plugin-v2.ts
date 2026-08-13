/**
 * OpenCode V2 plugin entrypoint.
 *
 * OpenCode 2.x uses a different plugin API: the default export must be an
 * object with an `id` and a `setup` function, instead of the V1 async factory
 * function. This module provides that V2 shape while reusing the same proxy,
 * MCP bridge, and tool machinery as the V1 plugin.
 *
 * The V1 and V2 entrypoints are combined in plugin-entry.ts as a dual export
 * ({ id, server, setup }) so a single package works on both OpenCode 1.x and
 * 2.x — mirroring how oh-my-opencode-slim does it.
 */
import { shouldEnableCursorPlugin } from "./plugin-toggle.js";
import { createLogger } from "./utils/logger.js";
import {
  CURSOR_PROVIDER_ID,
  buildAvailableToolsSystemMessage,
  buildToolHookEntries,
  ensureCursorProxyServer,
  resolveWorkspaceDirectory,
  ensurePluginDirectory,
  setStoredApiKey,
} from "./plugin.js";
import { readMcpConfigs } from "./mcp/config.js";
import { McpClientManager } from "./mcp/client-manager.js";
import {
  buildMcpToolHookEntries,
  buildMcpToolDefinitions,
  namespaceMcpTool,
} from "./mcp/tool-bridge.js";
import { autoRefreshModels } from "./models/sync.js";
import { ToolRegistry as CoreRegistry } from "./tools/core/registry.js";
import { registerDefaultTools } from "./tools/defaults.js";
import { ToolRouter } from "./tools/router.js";
import { SkillLoader } from "./tools/skills/loader.js";
import { SkillResolver } from "./tools/skills/resolver.js";
import { LocalExecutor } from "./tools/executors/local.js";
import { executeWithChain } from "./tools/core/executor.js";
import { buildLocalFallbackTools, shouldRegisterNativeToolHook } from "./plugin.js";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { TOOL_HOOK_EXCLUSIONS, TOOL_LOOP_MODE } from "./plugin.js";

const log = createLogger("plugin-v2");

/** Convert a V1-style tool entry (with zod args) into a V2 tool definition. */
function v2ToolFromV1(
  name: string,
  entry: any,
  jsonSchema?: Record<string, unknown>,
): { description: string; input: Record<string, unknown>; execute: (args: any, ctx: any) => Promise<unknown> } {
  const description = typeof entry?.description === "string" ? entry.description : name;
  // Prefer the original JSON schema when available; fall back to an empty object.
  const input =
    jsonSchema && typeof jsonSchema === "object"
      ? jsonSchema
      : { type: "object", properties: {} };
  const v1Execute = typeof entry?.execute === "function" ? entry.execute : async () => ({ content: "" });

  return {
    description,
    input,
    async execute(args: any, executeCtx: any) {
      const result = await v1Execute(args, executeCtx);
      // V1 tools return a string; V2 expects { content } or { output, content }.
      if (typeof result === "string") {
        return { content: result };
      }
      return result ?? { content: "" };
    },
  };
}

export function createV2Setup() {
  return async (ctx: any) => {
    const state = shouldEnableCursorPlugin();
    if (!state.enabled) {
      log.info("Plugin disabled in OpenCode config; skipping initialization", {
        configPath: state.configPath,
        reason: state.reason,
      });
      return;
    }

    const workspaceDirectory = resolveWorkspaceDirectory(ctx.worktree, ctx.directory);
    log.debug("V2 plugin initializing", {
      directory: ctx.directory,
      worktree: ctx.worktree,
      workspaceDirectory,
      cwd: process.cwd(),
    });

    await ensurePluginDirectory();
    autoRefreshModels().catch(() => {});

    // MCP bridge: connect to MCP servers and collect their tools.
    const mcpManager = new McpClientManager();
    let mcpToolEntries: Record<string, any> = {};
    let mcpToolDefs: any[] = [];
    let mcpToolSummaries: Array<{ serverName: string; toolName: string; callName?: string; description?: string; params?: string[] }> = [];
    const mcpEnabled = process.env.CURSOR_ACP_MCP_BRIDGE !== "false";

    if (mcpEnabled) {
      try {
        const configs = readMcpConfigs();
        if (configs.length > 0) {
          await Promise.allSettled(configs.map((c) => mcpManager.connectServer(c)));
          const tools = mcpManager.listTools();
          if (tools.length > 0) {
            mcpToolEntries = buildMcpToolHookEntries(tools, mcpManager);
            mcpToolDefs = buildMcpToolDefinitions(tools);
            mcpToolSummaries = tools.map((t: any) => ({
              serverName: t.serverName,
              toolName: t.name,
              callName: namespaceMcpTool(t.serverName, t.name),
              description: t.description,
              params: t.inputSchema
                ? Object.keys((t.inputSchema as any).properties ?? {})
                : undefined,
            }));
          }
        }
      } catch (err) {
        log.debug("MCP bridge init failed", { error: String(err) });
      }
    }

    // Tools (skills) discovery/execution wiring (same as V1).
    const toolsEnabled = process.env.CURSOR_ACP_ENABLE_OPENCODE_TOOLS !== "false";
    const legacyProxyToolPathsEnabled = toolsEnabled && TOOL_LOOP_MODE === "proxy-exec";
    const serverClient = legacyProxyToolPathsEnabled
      ? createOpencodeClient({ baseUrl: ctx.serverUrl?.toString(), directory: workspaceDirectory })
      : null;

    const localRegistry = new CoreRegistry();
    registerDefaultTools(localRegistry);
    const localExec = new LocalExecutor(localRegistry);
    const executorChain: any[] = [localExec];
    const toolsByName = new Map<string, any>();
    const skillLoader = new SkillLoader();
    let skillResolver: SkillResolver | null = null;

    const router = legacyProxyToolPathsEnabled
      ? new ToolRouter({
          execute: (toolId: string, args: any) => executeWithChain(executorChain, toolId, args),
          toolsByName,
          resolveName: (name: string) => skillResolver?.resolve(name),
        })
      : null;

    let lastToolNames: string[] = [];
    let lastToolMap: Array<{ id: string; name: string }> = [];

    const refreshTools = async () => {
      toolsByName.clear();
      const toolEntries: any[] = [];
      const localTools = buildLocalFallbackTools(localRegistry, TOOL_LOOP_MODE);
      for (const asTool of localTools) {
        toolsByName.set(asTool.name, asTool);
        toolEntries.push({ type: "function", function: { name: asTool.name, parameters: {} } });
      }
      const skills = skillLoader.load([...localTools]);
      skillResolver = new SkillResolver(skills);
      lastToolNames = toolEntries.map((e) => e.function.name);
      lastToolMap = localTools.map((t: any) => ({ id: t.id, name: t.name }));
      return toolEntries;
    };

    const proxyBaseURL = await ensureCursorProxyServer(workspaceDirectory, router ?? undefined);
    log.debug("Proxy server started", { baseURL: proxyBaseURL });

    // Register the cursor-acp provider + auth via catalog/integration transforms.
    await ctx.catalog.transform((catalog: any) => {
      catalog.provider.update(CURSOR_PROVIDER_ID, (p: any) => {
        p.name = "Cursor";
        p.api = {
          type: "aisdk",
          package: "aisdk:@ai-sdk/openai-compatible",
          settings: { baseURL: proxyBaseURL },
        };
      });
    });

    await ctx.integration.transform((integrations: any) => {
      integrations.method.update({
        integrationID: CURSOR_PROVIDER_ID,
        method: { type: "key", label: "Cursor API Key (cursor.com/settings)" },
      });
    });

    // Register local + MCP tools as V2 tools (best-effort).
    try {
      const toolHookEntries = buildToolHookEntries(localRegistry, workspaceDirectory);
      const allEntries = { ...toolHookEntries, ...mcpToolEntries };

      // Map registry tool names back to their JSON schemas.
      const schemaByName = new Map<string, Record<string, unknown>>();
      for (const t of localRegistry.list()) {
        schemaByName.set(t.name, t.parameters);
      }

      await ctx.tool.transform((tools: any) => {
        for (const [name, entry] of Object.entries(allEntries)) {
          const def = v2ToolFromV1(name, entry, schemaByName.get(name));
          tools.add(name, def, { codemode: true });
        }
      });
    } catch (err) {
      log.debug("Tool registration failed", { error: String(err) });
    }

    // Chat-params equivalent: force baseURL + inject MCP tool defs, and append
    // the available-tools system message on every turn.
    await ctx.session.hook("context", async (event: any) => {
      // V1 filled this from auth.loader. In V2 resolve the active integration
      // connection before every Cursor turn so the local proxy gets the key.
      try {
        const connection = await ctx.integration.connection.active(CURSOR_PROVIDER_ID);
        const credential = connection && await ctx.integration.connection.resolve(connection);
        if (credential?.type === "key") setStoredApiKey(credential.key);
      } catch (err) {
        log.debug("Could not resolve Cursor API key", { error: String(err) });
      }

      const modelRef = event.model;
      const isCursor = modelRef?.providerID === CURSOR_PROVIDER_ID;
      if (!isCursor) return;

      if (toolsEnabled && TOOL_LOOP_MODE === "opencode") {
        const existingTools = event.tools;
        if (existingTools == null) {
          const refreshed = await refreshTools();
          event.tools = refreshed;
        }
      }

      if (mcpToolDefs.length > 0) {
        // Surface MCP tools through the tools record so the model can call them.
        const current = event.tools && typeof event.tools === "object" ? event.tools : {};
        for (const def of mcpToolDefs) {
          const fname = def?.function?.name;
          if (fname && !(fname in current)) {
            current[fname] = def;
          }
        }
        event.tools = current;
      }

      const systemMessage = buildAvailableToolsSystemMessage(
        lastToolNames, lastToolMap, mcpToolDefs, mcpToolSummaries,
      );
      if (systemMessage) {
        event.system.push({ type: "text", text: systemMessage });
      }
    });
  };
}
