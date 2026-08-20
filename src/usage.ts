import type { StreamJsonResultEvent } from "./streaming/types.js";

export type CursorUsageMetrics = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost?: number;
};

export type OpenAiUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details: {
    cached_tokens: number;
    cache_write_tokens: number;
  };
  completion_tokens_details: {
    reasoning_tokens: number;
  };
  cost?: number;
};

function readTokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function readOptionalCost(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

export function normalizeCursorUsage(value: unknown): CursorUsageMetrics | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const usage = value as Record<string, unknown>;
  const metrics: CursorUsageMetrics = {
    inputTokens: readTokenCount(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens),
    outputTokens: readTokenCount(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens),
    reasoningTokens: readTokenCount(usage.reasoningTokens ?? usage.reasoning_tokens),
    cacheReadTokens: readTokenCount(usage.cacheReadTokens ?? usage.cache_read_tokens),
    cacheWriteTokens: readTokenCount(usage.cacheWriteTokens ?? usage.cache_write_tokens),
  };

  const cost = readOptionalCost(usage.cost ?? usage.totalCost ?? usage.total_cost);
  if (cost !== undefined) {
    metrics.cost = cost;
  }

  const hasUsage =
    metrics.inputTokens > 0
    || metrics.outputTokens > 0
    || metrics.reasoningTokens > 0
    || metrics.cacheReadTokens > 0
    || metrics.cacheWriteTokens > 0
    || cost !== undefined;

  return hasUsage ? metrics : undefined;
}

export function createOpenAiUsage(metrics: CursorUsageMetrics): OpenAiUsage {
  const promptTokens = metrics.inputTokens + metrics.cacheReadTokens + metrics.cacheWriteTokens;
  const totalTokens = promptTokens + metrics.outputTokens + metrics.reasoningTokens;
  const usage: OpenAiUsage = {
    prompt_tokens: promptTokens,
    completion_tokens: metrics.outputTokens,
    total_tokens: totalTokens,
    prompt_tokens_details: {
      cached_tokens: metrics.cacheReadTokens,
      cache_write_tokens: metrics.cacheWriteTokens,
    },
    completion_tokens_details: {
      reasoning_tokens: metrics.reasoningTokens,
    },
  };

  if (metrics.cost !== undefined) {
    usage.cost = metrics.cost;
  }

  return usage;
}

export function extractOpenAiUsageFromResult(event: StreamJsonResultEvent): OpenAiUsage | undefined {
  const metrics = normalizeCursorUsage(event.usage);
  return metrics ? createOpenAiUsage(metrics) : undefined;
}

export function createChatCompletionUsageChunk(
  id: string,
  created: number,
  model: string,
  usage: OpenAiUsage,
) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [],
    usage,
  };
}
