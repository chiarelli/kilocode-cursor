import { getCursorModelCost, type OpenCodeModelCost } from "./pricing.js";

export type DiscoveredCursorModel = {
  id: string;
  name: string;
};

export type CursorModelVariant = {
  baseId: string;
  variant: string | null;
  cursorModelId: string;
  name: string;
};

export type CursorModelGroup = {
  baseId: string;
  name: string;
  defaultCursorModelId: string;
  variants: Record<string, string>;
  members: CursorModelVariant[];
};

export type CursorModelGroups = {
  groups: CursorModelGroup[];
  direct: DiscoveredCursorModel[];
};

export type OpenCodeCursorModelEntry = {
  name: string;
  options?: {
    cursorModel: string;
  };
  variants?: Record<string, { cursorModel: string; cost?: OpenCodeModelCost }>;
  cost?: OpenCodeModelCost;
};

export type CursorModelMergeOptions = {
  variants: boolean;
  compact: boolean;
};

export type CursorModelMergeResult = {
  models: Record<string, unknown>;
  syncedCount: number;
  groupedCount: number;
  removedCount: number;
};

const DEFAULT_VARIANT_ORDER = [
  null,
  "medium",
  "high",
  "low",
  "none",
  "xhigh",
  "max",
];

const VARIANT_DISPLAY_ORDER = [
  "none",
  "low",
  "low-fast",
  "fast",
  "medium",
  "medium-fast",
  "medium-thinking",
  "high",
  "high-fast",
  "high-thinking",
  "high-thinking-fast",
  "xhigh",
  "xhigh-fast",
  "max",
  "max-thinking",
  "max-thinking-fast",
  "thinking",
  "thinking-low",
  "thinking-medium",
  "thinking-high",
  "thinking-high-fast",
  "thinking-xhigh",
  "thinking-max",
  "extra-high",
  "spark-preview",
  "spark-preview-low",
  "spark-preview-medium",
  "spark-preview-high",
  "spark-preview-xhigh",
];

function isSafeBaseId(baseId: string): boolean {
  const parts = baseId.split("-").filter(Boolean);
  if (parts.length < 2) return false;
  if (baseId === "gpt-5") return false;
  return true;
}

// Token-aligned hyphen-truncated prefixes, longest first, filtered through
// isSafeBaseId. Example: "gpt-5.3-codex-spark-preview-low" yields
// ["gpt-5.3-codex-spark-preview", "gpt-5.3-codex", "gpt-5.3"].
function generateBaseCandidates(modelId: string): string[] {
  const tokens = modelId.split("-");
  const candidates: string[] = [];
  for (let i = tokens.length - 1; i >= 1; i--) {
    const prefix = tokens.slice(0, i).join("-");
    if (isSafeBaseId(prefix)) candidates.push(prefix);
  }
  return candidates;
}

type CandidateStat = { count: number; diversity: number };

// childCount(B) = number of models that have B as a strict token-prefix
// (model starts with `${B}-`). diversity = distinct first tokens after the
// prefix; used to prefer bases that fan out across multiple sibling families.
function computeStats(
  candidate: string,
  modelIds: readonly string[],
): CandidateStat {
  const prefix = `${candidate}-`;
  const firstTokens = new Set<string>();
  let count = 0;
  for (const otherId of modelIds) {
    if (!otherId.startsWith(prefix)) continue;
    count++;
    const firstToken = otherId.slice(prefix.length).split("-", 1)[0];
    if (firstToken) firstTokens.add(firstToken);
  }
  return { count, diversity: firstTokens.size };
}

// Selection priority for the chosen base of a model:
//   A. Shortest explicit base with >= 2 strict children. An explicit
//      candidate that already heads its own family wins outright. Shortest
//      wins so spark-preview-low folds under gpt-5.3-codex when both
//      gpt-5.3-codex and gpt-5.3-codex-spark-preview are in the set.
//   B. Best implicit base (any candidate with >= 2 strict children). Pick
//      highest first-token diversity, breaking ties by longer base. Keeps
//      claude-4.6-opus (fans out into high/max) from being shadowed by
//      claude-4.6-opus-high (only thinking-fan-out) or by claude-4.6 (only
//      opus-fan-out).
//   C. Shortest explicit fallback regardless of childCount. Catches cases
//      like composer-2-fast where the only candidate is explicit but has no
//      other siblings to satisfy the >= 2 rule.
function chooseBase(
  modelId: string,
  knownModelIds: Set<string>,
  modelIds: readonly string[],
): string | null {
  const candidates = generateBaseCandidates(modelId);
  if (candidates.length === 0) return null;

  const stats = new Map<string, CandidateStat>();
  for (const candidate of candidates) {
    stats.set(candidate, computeStats(candidate, modelIds));
  }

  let stepA: string | null = null;
  for (const candidate of candidates) {
    if (!knownModelIds.has(candidate)) continue;
    const stat = stats.get(candidate);
    if (!stat || stat.count < 2 || stat.diversity < 2) continue;
    if (stepA === null || candidate.length < stepA.length) stepA = candidate;
  }
  if (stepA !== null) return stepA;

  let stepB: { base: string; diversity: number } | null = null;
  for (const candidate of candidates) {
    const stat = stats.get(candidate);
    if (!stat || stat.count < 2) continue;
    if (
      stepB === null ||
      stat.diversity > stepB.diversity ||
      (stat.diversity === stepB.diversity && candidate.length > stepB.base.length)
    ) {
      stepB = { base: candidate, diversity: stat.diversity };
    }
  }
  if (stepB !== null) return stepB.base;

  let stepC: string | null = null;
  for (const candidate of candidates) {
    if (!knownModelIds.has(candidate)) continue;
    if (stepC === null || candidate.length < stepC.length) stepC = candidate;
  }
  return stepC;
}

function getDefaultMember(members: CursorModelVariant[]): CursorModelVariant {
  for (const variant of DEFAULT_VARIANT_ORDER) {
    const member = members.find(candidate => candidate.variant === variant);
    if (member) return member;
  }

  return members[0];
}

function formatModelName(modelId: string): string {
  return modelId
    .split("-")
    .map(part => {
      if (part === "gpt") return "GPT";
      if (part === "xhigh") return "XHigh";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function compareVariants(a: CursorModelVariant, b: CursorModelVariant): number {
  if (a.variant === null) return -1;
  if (b.variant === null) return 1;

  const aIndex = VARIANT_DISPLAY_ORDER.indexOf(a.variant);
  const bIndex = VARIANT_DISPLAY_ORDER.indexOf(b.variant);

  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
  if (aIndex !== -1) return -1;
  if (bIndex !== -1) return 1;
  return a.variant.localeCompare(b.variant);
}

function createGroup(baseId: string, members: CursorModelVariant[]): CursorModelGroup {
  const defaultMember = getDefaultMember(members);
  const variants: Record<string, string> = {};

  for (const member of [...members].sort(compareVariants)) {
    if (member.variant) {
      variants[member.variant] = member.cursorModelId;
    }
  }

  return {
    baseId,
    name: defaultMember.variant === null ? defaultMember.name : formatModelName(baseId),
    defaultCursorModelId: defaultMember.cursorModelId,
    variants,
    members,
  };
}

export function groupCursorModels(models: DiscoveredCursorModel[]): CursorModelGroups {
  const knownModelIds = new Set(models.map(model => model.id));
  const modelIds = models.map(model => model.id);

  const preferredBase = new Map<string, string>();
  for (const model of models) {
    const base = chooseBase(model.id, knownModelIds, modelIds);
    if (base) preferredBase.set(model.id, base);
  }

  // A model that is itself chosen as a base by some other model joins its own
  // group as variant=null instead of being absorbed into a (different) base.
  // This preserves explicit-base semantics: e.g. gpt-5.3-codex stays the head
  // of its group rather than being folded under gpt-5.3 just because chooseBase
  // for gpt-5.3-codex would otherwise return gpt-5.3.
  const baseSet = new Set<string>(preferredBase.values());

  const groupMembers = new Map<string, CursorModelVariant[]>();
  const groupOrder: string[] = [];

  const recordMember = (baseId: string, member: CursorModelVariant): void => {
    const existing = groupMembers.get(baseId);
    if (existing) {
      existing.push(member);
      return;
    }
    groupMembers.set(baseId, [member]);
    groupOrder.push(baseId);
  };

  for (const model of models) {
    if (baseSet.has(model.id) && knownModelIds.has(model.id)) {
      recordMember(model.id, {
        baseId: model.id,
        variant: null,
        cursorModelId: model.id,
        name: model.name,
      });
      continue;
    }

    const base = preferredBase.get(model.id);
    if (!base) continue;

    recordMember(base, {
      baseId: base,
      variant: model.id.slice(base.length + 1),
      cursorModelId: model.id,
      name: model.name,
    });
  }

  const groupedIds = new Set<string>();
  const groups: CursorModelGroup[] = [];

  for (const baseId of groupOrder) {
    const members = groupMembers.get(baseId);
    if (!members || members.length < 2) continue;
    groups.push(createGroup(baseId, members));
    for (const member of members) groupedIds.add(member.cursorModelId);
  }

  const direct: DiscoveredCursorModel[] = [];
  for (const model of models) {
    if (groupedIds.has(model.id)) continue;
    direct.push(model);
  }

  return { groups, direct };
}

export function createVariantModelEntries(models: DiscoveredCursorModel[]): {
  entries: Record<string, OpenCodeCursorModelEntry>;
  groupedModelIds: Set<string>;
} {
  const { groups, direct } = groupCursorModels(models);
  const entries: Record<string, OpenCodeCursorModelEntry> = {};
  const groupedModelIds = new Set<string>();

  for (const group of groups) {
    const variants: Record<string, { cursorModel: string; cost?: OpenCodeModelCost }> = {};
    for (const [variant, cursorModel] of Object.entries(group.variants)) {
      const variantEntry: { cursorModel: string; cost?: OpenCodeModelCost } = { cursorModel };
      const variantCost = getCursorModelCost(cursorModel);
      if (variantCost) variantEntry.cost = variantCost;
      variants[variant] = variantEntry;
    }

    const groupEntry: OpenCodeCursorModelEntry = {
      name: group.name,
      options: {
        cursorModel: group.defaultCursorModelId,
      },
      variants,
    };
    const defaultCost = getCursorModelCost(group.defaultCursorModelId);
    if (defaultCost) groupEntry.cost = defaultCost;
    entries[group.baseId] = groupEntry;

    for (const member of group.members) {
      groupedModelIds.add(member.cursorModelId);
    }
  }

  for (const model of direct) {
    const entry: OpenCodeCursorModelEntry = { name: model.name };
    const directCost = getCursorModelCost(model.id);
    if (directCost) entry.cost = directCost;
    entries[model.id] = entry;
  }

  return { entries, groupedModelIds };
}

export function mergeCursorModelEntries(
  existingModels: Record<string, unknown>,
  discoveredModels: DiscoveredCursorModel[],
  options: CursorModelMergeOptions,
): CursorModelMergeResult {
  if (!options.variants) {
    return mergeDirectModelEntries(existingModels, discoveredModels);
  }

  const { entries, groupedModelIds } = createVariantModelEntries(discoveredModels);
  const models = { ...existingModels };
  let removedCount = 0;

  if (options.compact) {
    for (const modelId of groupedModelIds) {
      if (!Object.prototype.hasOwnProperty.call(models, modelId)) continue;
      if (Object.prototype.hasOwnProperty.call(entries, modelId)) continue;
      delete models[modelId];
      removedCount++;
    }
  }

  for (const [modelId, entry] of Object.entries(entries)) {
    models[modelId] = mergeEntryPreservingUserFields(models[modelId], entry);
  }

  return {
    models,
    syncedCount: Object.keys(entries).length,
    groupedCount: groupedModelIds.size,
    removedCount,
  };
}

function mergeDirectModelEntries(
  existingModels: Record<string, unknown>,
  discoveredModels: DiscoveredCursorModel[],
): CursorModelMergeResult {
  const models = { ...existingModels };

  for (const model of discoveredModels) {
    const generated: OpenCodeCursorModelEntry = { name: model.name };
    const directCost = getCursorModelCost(model.id);
    if (directCost) generated.cost = directCost;
    models[model.id] = mergeEntryPreservingUserFields(models[model.id], generated);
  }

  return {
    models,
    syncedCount: discoveredModels.length,
    groupedCount: 0,
    removedCount: 0,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Preserve user-set cost on every sync. Only fill cost when the user has not.
function mergeEntryPreservingUserFields(
  existing: unknown,
  generated: OpenCodeCursorModelEntry,
): OpenCodeCursorModelEntry {
  if (!isPlainObject(existing)) return generated;

  const merged: Record<string, unknown> = { ...existing, ...generated };

  if (existing.cost !== undefined) {
    merged.cost = existing.cost;
  }

  if (isPlainObject(existing.variants) && isPlainObject(generated.variants)) {
    const mergedVariants: Record<string, unknown> = { ...generated.variants };
    for (const [variantKey, existingVariant] of Object.entries(existing.variants)) {
      const generatedVariant = (generated.variants as Record<string, unknown>)[variantKey];
      if (!isPlainObject(existingVariant)) continue;
      if (!isPlainObject(generatedVariant)) {
        mergedVariants[variantKey] = existingVariant;
        continue;
      }
      const variantMerged: Record<string, unknown> = { ...generatedVariant };
      if (existingVariant.cost !== undefined) {
        variantMerged.cost = existingVariant.cost;
      }
      mergedVariants[variantKey] = variantMerged;
    }
    merged.variants = mergedVariants;
  }

  return merged as OpenCodeCursorModelEntry;
}
