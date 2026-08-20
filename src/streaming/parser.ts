import type { StreamJsonEvent } from "./types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("streaming:parser");

export const parseStreamJsonLine = (line: string): StreamJsonEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as StreamJsonEvent;
  } catch {
    log.debug("Failed to parse NDJSON line", { line: trimmed.substring(0, 100) });
    return null;
  }
};
