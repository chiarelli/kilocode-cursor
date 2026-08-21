/**
 * Build Kilo-native model catalog entries from flat cursor-agent model IDs.
 *
 * Output format matches Kilo provider config (see kilo.jsonc example):
 *   "cursor/gpt-5.6-luna": {
 *     "name": "GPT-5.6 Luna",
 *     "reasoning": true,
 *     "variants": { "low": { "reasoning": { "effort": "low" } }, ... },
 *     "options": { "cursorModel": "gpt-5.6-luna-medium" }  // wire id for default
 *   }
 */
import { getCursorModelCost, type OpenCodeModelCost } from "./pricing.js";
import type { DiscoveredCursorModel } from "../cli/model-discovery.js";
import { maxContextLimitForWireIds, buildModelLimit } from "./context-limits.js";

export const KILO_MODEL_PREFIX = "";

const EFFORT_VARIANTS = new Set([
  "none", "low", "medium", "high", "max", "xhigh",
  "low-fast", "medium-fast", "high-fast", "xhigh-fast",
  "extra-high", "fast",
]);

type ParsedModel = {
  wireId: string;
  displayName: string;
  family: string;
  thinking: boolean;
  variant: string | null;
};

export type KiloModelEntry = {
  name: string;
  tool_call?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  modalities?: { input: string[]; output: string[] };
  limit?: { context: number; output: number };
  cost?: OpenCodeModelCost;
  variants?: Record<string, { reasoning?: { effort: string }; options?: { cursorModel: string } }>;
  options?: { cursorModel: string };
};

export type KiloCatalogResult = {
  models: Record<string, KiloModelEntry>;
  wireIdByConfigKey: Map<string, string>;
  /** configKey + variant → wire model id */
  resolveWireModel: (configModelId: string, variantKey?: string) => string | undefined;
};

function formatDisplayName(family: string, thinking: boolean): string {
  const base = family
    .split("-")
    .map((p) => {
      if (p === "gpt") return "GPT";
      if (p === "xhigh") return "XHigh";
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
  return thinking ? `${base} (Thinking)` : base;
}

function parseModel(model: DiscoveredCursorModel): ParsedModel | null {
  const wireId = model.id.replace(/^cursor-/, "");
  let id = wireId;

  // thinking-* variants: claude-fable-5-thinking-high
  const thinkingMatch = id.match(/^(.+)-thinking-([a-z0-9-]+)$/i);
  if (thinkingMatch) {
    const variant = thinkingMatch[2]!;
    if (EFFORT_VARIANTS.has(variant) || variant.includes("fast")) {
      return {
        wireId,
        displayName: model.name,
        family: thinkingMatch[1]!,
        thinking: true,
        variant,
      };
    }
  }

  // *-thinking suffix without effort: model-thinking
  if (id.endsWith("-thinking")) {
    return {
      wireId,
      displayName: model.name,
      family: id.slice(0, -"-thinking".length),
      thinking: true,
      variant: null,
    };
  }

  // effort suffix: model-high, model-low-fast
  for (const effort of [...EFFORT_VARIANTS].sort((a, b) => b.length - a.length)) {
    if (id === effort) continue;
    const suffix = `-${effort}`;
    if (id.endsWith(suffix)) {
      return {
        wireId,
        displayName: model.name,
        family: id.slice(0, -suffix.length),
        thinking: false,
        variant: effort,
      };
    }
  }

  // bare model id
  if (id.length > 0) {
    return {
      wireId,
      displayName: model.name,
      family: id,
      thinking: false,
      variant: null,
    };
  }
  return null;
}

function configKey(family: string, thinking: boolean): string {
  const slug = thinking ? `${family}-thinking` : family;
  return slug;
}

function inferCapabilities(family: string, thinking: boolean): Partial<KiloModelEntry> {
  const entry: Partial<KiloModelEntry> = {
    tool_call: true,
    temperature: true,
  };
  if (thinking || family.includes("thinking") || /gpt|claude|grok|kimi|glm|composer/.test(family)) {
    entry.reasoning = thinking || undefined;
  }
  if (/gpt|claude|grok|composer|glm/.test(family)) {
    entry.modalities = { input: ["text", "image"], output: ["text"] };
  } else {
    entry.modalities = { input: ["text"], output: ["text"] };
  }
  return entry;
}

export function buildKiloModelCatalog(discovered: DiscoveredCursorModel[]): KiloCatalogResult {
  const groups = new Map<string, { thinking: boolean; members: ParsedModel[] }>();
  const discoveredById = new Map(discovered.map((model) => [model.id, model]));

  for (const model of discovered) {
    if (model.id === "auto") {
      continue; // handled separately
    }
    const parsed = parseModel(model);
    if (!parsed) continue;
    const key = `${parsed.family}\0${parsed.thinking}`;
    const group = groups.get(key) ?? { thinking: parsed.thinking, members: [] };
    group.members.push(parsed);
    groups.set(key, group);
  }

  const models: Record<string, KiloModelEntry> = {};
  const wireResolver = new Map<string, string>();

  const registerWire = (configKey: string, variant: string | null, wireId: string) => {
    wireResolver.set(variant ? `${configKey}\0${variant}` : `${configKey}\0`, wireId);
  };

  for (const [, group] of groups) {
    if (group.members.length === 0) continue;
    const family = group.members[0]!.family;
    const ck = configKey(family, group.thinking);

    const variantMembers = group.members.filter((m) => m.variant !== null);
    const defaultMember =
      group.members.find((m) => m.variant === null)
      ?? group.members.find((m) => m.variant === "medium")
      ?? group.members[0]!;

    const entry: KiloModelEntry = {
      name: formatDisplayName(family, group.thinking),
      ...inferCapabilities(family, group.thinking),
    };

    const defaultCost = getCursorModelCost(defaultMember.wireId);
    if (defaultCost) entry.cost = defaultCost;

    const contextLimit = maxContextLimitForWireIds(
      group.members.map((member) => member.wireId),
      discoveredById,
    );
    if (contextLimit !== undefined) {
      entry.limit = buildModelLimit(contextLimit);
    }

    entry.options = { cursorModel: defaultMember.wireId };
    registerWire(ck, null, defaultMember.wireId);

    if (variantMembers.length > 0) {
      entry.reasoning = true;
      entry.variants = {};
      for (const member of variantMembers) {
        const variantKey = member.variant!;
        const effort = variantKey.replace(/-fast$/, "").replace(/-thinking$/, "");
        entry.variants[variantKey] = {
          reasoning: { effort },
          options: { cursorModel: member.wireId },
        };
        registerWire(ck, variantKey, member.wireId);
        const variantCost = getCursorModelCost(member.wireId);
        if (variantCost && entry.variants[variantKey]) {
          (entry.variants[variantKey] as any).cost = variantCost;
        }
      }
    }

    models[ck] = entry;
  }

  // auto
  const autoModel = discovered.find((m) => m.id === "auto");
  if (autoModel) {
    models[`${KILO_MODEL_PREFIX}auto`] = {
      name: "Auto (Cursor routing)",
      options: { cursorModel: "auto" },
    };
    registerWire(`${KILO_MODEL_PREFIX}auto`, null, "auto");
  }

  const resolveWireModel = (configModelId: string, variantKey?: string): string | undefined => {
    const direct = wireResolver.get(`${configModelId}\0${variantKey ?? ""}`);
    if (direct) return direct;
    const entry = models[configModelId];
    if (!entry) return undefined;
    if (variantKey && entry.variants?.[variantKey]?.options?.cursorModel) {
      return entry.variants[variantKey].options!.cursorModel;
    }
    return entry.options?.cursorModel;
  };

  return {
    models,
    wireIdByConfigKey: wireResolver,
    resolveWireModel,
  };
}

/** Build a runtime resolver from synced provider.models config entries. */
export function buildKiloCatalogFromConfigModels(
  models: Record<string, unknown>,
): KiloCatalogResult {
  const catalogModels: Record<string, KiloModelEntry> = {};
  const wireResolver = new Map<string, string>();

  const registerWire = (configKey: string, variant: string | null, wireId: string) => {
    wireResolver.set(variant ? `${configKey}\0${variant}` : `${configKey}\0`, wireId);
  };

  for (const [key, raw] of Object.entries(models)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as KiloModelEntry;
    catalogModels[key] = entry;

    if (entry.options?.cursorModel) {
      registerWire(key, null, entry.options.cursorModel);
    }

    if (entry.variants) {
      for (const [variantKey, variant] of Object.entries(entry.variants)) {
        const wire = variant.options?.cursorModel;
        if (wire) {
          registerWire(key, variantKey, wire);
        }
        const effort = variant.reasoning?.effort;
        if (effort && wire) {
          registerWire(key, effort, wire);
        }
      }
    }
  }

  const resolveWireModel = (configModelId: string, variantKey?: string): string | undefined => {
    const direct = wireResolver.get(`${configModelId}\0${variantKey ?? ""}`);
    if (direct) return direct;

    const entry = catalogModels[configModelId];
    if (!entry) return undefined;

    if (variantKey && entry.variants?.[variantKey]?.options?.cursorModel) {
      return entry.variants[variantKey].options!.cursorModel;
    }

    return entry.options?.cursorModel;
  };

  return {
    models: catalogModels,
    wireIdByConfigKey: wireResolver,
    resolveWireModel,
  };
}

export function mergeKiloModelCatalog(
  existing: Record<string, unknown>,
  discovered: DiscoveredCursorModel[],
  compact: boolean,
): { models: Record<string, unknown>; syncedCount: number; removedCount: number } {
  const { models: generated } = buildKiloModelCatalog(discovered);
  const merged = { ...existing };
  let removedCount = 0;

  if (compact) {
    const groupedWireIds = new Set<string>();
    const generatedKeys = new Set(Object.keys(generated));
    for (const entry of Object.values(generated)) {
      const e = entry as KiloModelEntry;
      if (e.options?.cursorModel) groupedWireIds.add(e.options.cursorModel);
      if (e.variants) {
        for (const v of Object.values(e.variants)) {
          if (v.options?.cursorModel) groupedWireIds.add(v.options.cursorModel);
        }
      }
    }
    for (const key of Object.keys(merged)) {
      if (generatedKeys.has(key) || key.startsWith("cursor/")) continue;
      if (groupedWireIds.has(key) || discovered.some((d) => d.id === key)) {
        delete merged[key];
        removedCount++;
      }
    }
  }

  for (const [key, entry] of Object.entries(generated)) {
    merged[key] = mergePreservingUserFields(merged[key], entry);
  }

  return { models: merged, syncedCount: Object.keys(generated).length, removedCount };
}

function mergePreservingUserFields(existing: unknown, generated: KiloModelEntry): KiloModelEntry {
  if (!existing || typeof existing !== "object") return generated;
  const e = existing as Record<string, unknown>;
  const merged: KiloModelEntry = { ...generated, ...e } as KiloModelEntry;
  if (e.cost !== undefined) merged.cost = e.cost as OpenCodeModelCost;
  if (e.name !== undefined) merged.name = String(e.name);
  if (generated.limit?.context !== undefined) {
    const existingLimit = e.limit && typeof e.limit === "object" && !Array.isArray(e.limit)
      ? e.limit as Record<string, unknown>
      : {};
    merged.limit = {
      context: readLimitNumber(existingLimit.context) ?? generated.limit.context,
      output: readLimitNumber(existingLimit.output) ?? generated.limit.output,
    };
  }
  return merged;
}

function readLimitNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  return undefined;
}

/** Normalize Kilo model ids that may include duplicate provider prefixes. */
export function normalizeConfigModelId(raw: string): string {
  let id = raw.trim().replace(/^cursor-kilo\//, "").replace(/^cursor\//, "");
  while (id.startsWith("cursor/")) {
    id = id.slice("cursor/".length);
  }
  return id;
}

/** Resolve runtime cursor wire model from Kilo request body */
export function resolveWireModelFromRequest(
  catalog: KiloCatalogResult | null,
  model: unknown,
  body: Record<string, unknown>,
): string {
  const raw = typeof model === "string" ? model.trim() : "";
  const cursorModel = typeof body.cursorModel === "string" ? body.cursorModel.trim() : "";
  if (cursorModel) return cursorModel.replace(/^cursor\//, "").replace(/^cursor-kilo\//, "");

  // Variant from Kilo provider options
  const variant = extractVariantEffort(body);
  if (catalog && raw) {
    const configKey = normalizeConfigModelId(raw);
    const resolved = catalog.resolveWireModel(configKey, variant ?? undefined);
    if (resolved) return resolved;

    if (variant) {
      const family = configKey.replace(/^cursor\//, "");
      const suffixWire = `${family}-${variant}`;
      if (suffixWire !== family) return suffixWire;
    }
  }

  const normalized = normalizeConfigModelId(raw);
  return normalized || "auto";
}

function extractVariantEffort(body: Record<string, unknown>): string | null {
  for (const source of collectReasoningSources(body)) {
    const effort = readReasoningEffort(source);
    if (effort) return effort;
  }

  const variant = body.variant;
  if (typeof variant === "string" && variant.length > 0) return variant;

  return null;
}

function collectReasoningSources(body: Record<string, unknown>): unknown[] {
  const sources: unknown[] = [body.reasoning, body.options, body.providerOptions];
  const providerOptions = body.providerOptions;
  if (providerOptions && typeof providerOptions === "object" && !Array.isArray(providerOptions)) {
    const cursor = (providerOptions as Record<string, unknown>).cursor;
    sources.push(cursor);
    if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
      sources.push((cursor as Record<string, unknown>).reasoning);
      sources.push((cursor as Record<string, unknown>).options);
    }
  }
  return sources;
}

function readReasoningEffort(source: unknown): string | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const effort = (source as Record<string, unknown>).effort;
  return typeof effort === "string" && effort.length > 0 ? effort : null;
}
