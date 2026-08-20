import type { IToolExecutor, ExecutionResult } from "../core/types.js";
import type { ToolRegistry } from "../core/registry.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tools:executor:local");

export class LocalExecutor implements IToolExecutor {
  constructor(private registry: ToolRegistry) {}

  canExecute(toolId: string): boolean {
    return Boolean(this.registry.getHandler(toolId));
  }

  async execute(toolId: string, args: Record<string, unknown>): Promise<ExecutionResult> {
    const handler = this.registry.getHandler(toolId);
    if (!handler) return { status: "error", error: `Unknown tool ${toolId}` };
    try {
      const out = await handler(args);
      return { status: "success", output: out };
    } catch (err: any) {
      log.warn("Local tool execution failed", { toolId, error: String(err?.message || err) });
      return { status: "error", error: String(err?.message || err) };
    }
  }
}
