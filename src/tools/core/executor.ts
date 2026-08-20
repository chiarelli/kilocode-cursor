import type { IToolExecutor, ExecutionResult } from "./types.js";
import { createLogger } from "../../utils/logger.js";

const log = createLogger("tools:executor:chain");

/**
 * Executes using the first executor that declares it can handle the toolId.
 */
export async function executeWithChain(
  executors: IToolExecutor[],
  toolId: string,
  args: Record<string, unknown>
): Promise<ExecutionResult> {
  for (const ex of executors) {
    if (ex.canExecute(toolId)) {
      try {
        return await ex.execute(toolId, args);
      } catch (err: any) {
        log.warn("Executor threw unexpected error", { toolId, error: String(err?.message || err) });
        return { status: "error", error: String(err?.message || err) };
      }
    }
  }
  return { status: "error", error: `No executor available for ${toolId}` };
}
