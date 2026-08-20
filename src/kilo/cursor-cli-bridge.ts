import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../utils/logger.js";

const log = createLogger("kilo:cursor-cli-bridge");

/**
 * Deny cursor-agent native MCP execution — Kilo owns MCP tools in passthrough mode.
 * See https://cursor.com/docs/cli/reference/permissions
 */
export const KILO_PASSTHROUGH_BRIDGE_CLI_CONFIG = {
  permissions: {
    deny: ["Mcp(*:*)"],
  },
  approvalMode: "allowlist",
} as const;

export function syncKiloPassthroughBridgeCliConfig(workspaceDirectory: string): void {
  if (!workspaceDirectory) {
    return;
  }

  try {
    const cursorDir = join(workspaceDirectory, ".cursor");
    mkdirSync(cursorDir, { recursive: true });
    const cliPath = join(cursorDir, "cli.json");
    writeFileSync(
      cliPath,
      `${JSON.stringify(KILO_PASSTHROUGH_BRIDGE_CLI_CONFIG, null, 2)}\n`,
      "utf8",
    );
    log.debug("Synced passthrough bridge cli.json", { path: cliPath });
  } catch (error) {
    log.debug("Failed to sync passthrough bridge cli.json", { error: String(error) });
  }
}
