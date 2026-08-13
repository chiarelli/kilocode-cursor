/**
 * OpenCode plugin entrypoint (dual V1/V2).
 *
 * OpenCode 1.x loads plugins as an async factory function (or an object with a
 * `server` field); OpenCode 2.x expects an object with `id` + `setup`. Exporting
 * both keeps a single package working across both major versions.
 *
 * When cursor-acp is removed from the `plugin` array in opencode.json,
 * this entrypoint turns into a no-op so users can disable the plugin
 * without deleting the symlink file.
 */
import type { Plugin } from "@opencode-ai/plugin";
import { shouldEnableCursorPlugin } from "./plugin-toggle.js";
import { createLogger } from "./utils/logger.js";
import { createV2Setup } from "./plugin-v2.js";

const log = createLogger("plugin-entry");

const CursorPluginEntry: Plugin = async (input) => {
  const state = shouldEnableCursorPlugin();
  if (!state.enabled) {
    log.info("Plugin disabled in OpenCode config; skipping initialization", {
      configPath: state.configPath,
      reason: state.reason,
    });
    return {};
  }

  const mod = await import("./plugin.js");
  return mod.CursorPlugin(input);
};

export default {
  id: "open-cursor",
  server: CursorPluginEntry,
  setup: createV2Setup(),
};
