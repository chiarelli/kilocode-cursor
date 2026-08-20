import type { IToolExecutor, ExecutionResult } from "../core/types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tools:executor:sdk");

export class SdkExecutor implements IToolExecutor {
  private toolIds = new Set<string>();

  constructor(private client: any, private timeoutMs: number) {}

  setToolIds(ids: Iterable<string>): void {
    this.toolIds = new Set(ids);
  }

  canExecute(toolId: string): boolean {
    return this.toolIds.has(toolId) && Boolean(this.client?.tool?.invoke);
  }

  async execute(toolId: string, args: Record<string, unknown>): Promise<ExecutionResult> {
    if (!this.canExecute(toolId)) return { status: "error", error: "SDK invoke unavailable" };
    try {
      const p = this.client.tool.invoke(toolId, args);
      const res = await this.runWithTimeout(p);
      const out = typeof res === "string" ? res : JSON.stringify(res);
      return { status: "success", output: out };
    } catch (err: any) {
      log.warn("SDK tool execution failed", { toolId, error: String(err?.message || err) });
      return { status: "error", error: String(err?.message || err) };
    }
  }

  private async runWithTimeout<T>(p: Promise<T>): Promise<T> {
    if (!this.timeoutMs) return p;
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error("tool execution timeout")), this.timeoutMs)),
    ]);
  }
}
