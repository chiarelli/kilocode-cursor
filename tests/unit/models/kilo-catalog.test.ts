import { describe, expect, it } from "bun:test";
import {
  buildKiloCatalogFromConfigModels,
  buildKiloModelCatalog,
  mergeKiloModelCatalog,
  normalizeCursorAgentWireId,
  resolveWireModelFromRequest,
} from "../../../src/models/kilo-catalog.js";

describe("kilo-catalog", () => {
  it("groups flat effort variants into cursor/ entries with reasoning variants", () => {
    const discovered = [
      { id: "claude-fable-5", name: "Claude Fable 5", contextLimit: 200000 },
      { id: "claude-fable-5-low", name: "Claude Fable 5 Low", contextLimit: 200000 },
      { id: "claude-fable-5-medium", name: "Claude Fable 5 Medium", contextLimit: 200000 },
      { id: "claude-fable-5-high", name: "Claude Fable 5 High", contextLimit: 200000 },
      { id: "claude-fable-5-max", name: "Claude Fable 5 Max", contextLimit: 1000000 },
      { id: "claude-fable-5-thinking-low", name: "Claude Fable 5 Thinking Low", contextLimit: 200000 },
      { id: "claude-fable-5-thinking-high", name: "Claude Fable 5 Thinking High", contextLimit: 200000 },
    ];

    const { models } = buildKiloModelCatalog(discovered);

    expect(models["claude-fable-5"]).toBeDefined();
    expect(models["claude-fable-5"]?.limit).toEqual({ context: 1000000, output: 65536 });
    expect(models["claude-fable-5"]?.variants?.low).toEqual({
      reasoning: { effort: "low" },
      options: { cursorModel: "claude-fable-5-low" },
    });
    expect(models["claude-fable-5"]?.variants?.high?.options?.cursorModel).toBe(
      "claude-fable-5-high",
    );

    expect(models["claude-fable-5-thinking"]).toBeDefined();
    expect(models["claude-fable-5-thinking"]?.variants?.high?.options?.cursorModel).toBe(
      "claude-fable-5-thinking-high",
    );
  });

  it("removes flat model ids when compact merging", () => {
    const existing = {
      "claude-fable-5-high": { name: "old flat" },
      "claude-fable-5": { name: "Grouped", cost: { input: 1, output: 2 } },
    };
    const discovered = [
      { id: "claude-fable-5-medium", name: "Medium" },
      { id: "claude-fable-5-high", name: "High" },
    ];

    const { models, removedCount } = mergeKiloModelCatalog(existing, discovered, true);
    expect(models["claude-fable-5-high"]).toBeUndefined();
    expect(removedCount).toBeGreaterThan(0);
    expect(models["claude-fable-5"]).toBeDefined();
  });

  it("keeps cursor- prefix on Grok wire ids from discovery", () => {
    const { models } = buildKiloModelCatalog([
      { id: "cursor-grok-4.6-medium", name: "Cursor Grok 4.6 Medium" },
      { id: "cursor-grok-4.6-high", name: "Cursor Grok 4.6" },
    ]);

    expect(models["grok-4.6"]?.options?.cursorModel).toBe("cursor-grok-4.6-medium");
    expect(models["grok-4.6"]?.variants?.high?.options?.cursorModel).toBe("cursor-grok-4.6-high");
  });

  it("normalizes legacy grok wire ids without cursor- prefix", () => {
    const catalog = buildKiloCatalogFromConfigModels({
      "grok-4.6": {
        options: { cursorModel: "grok-4.6-medium" },
        variants: {
          high: {
            reasoning: { effort: "high" },
            options: { cursorModel: "grok-4.6-high" },
          },
        },
      },
    });

    expect(
      resolveWireModelFromRequest(catalog, "cursor/grok-4.6", {}),
    ).toBe("cursor-grok-4.6-medium");
    expect(
      resolveWireModelFromRequest(catalog, "cursor/grok-4.6", { reasoning: { effort: "high" } }),
    ).toBe("cursor-grok-4.6-high");
    expect(normalizeCursorAgentWireId("grok-4.6-medium")).toBe("cursor-grok-4.6-medium");
    expect(normalizeCursorAgentWireId("gpt-5.3-codex")).toBe("gpt-5.3-codex");
  });

  it("resolves reasoning effort to wire model id at runtime", () => {
    const catalog = buildKiloModelCatalog([
      { id: "gpt-5.4-medium", name: "GPT 5.4 Medium" },
      { id: "gpt-5.4-high", name: "GPT 5.4 High" },
    ]);

    expect(
      resolveWireModelFromRequest(catalog, "cursor/gpt-5.4", { reasoning: { effort: "high" } }),
    ).toBe("gpt-5.4-high");
  });

  it("builds resolver from synced config models", () => {
    const catalog = buildKiloCatalogFromConfigModels({
      "gpt-5.4": {
        options: { cursorModel: "gpt-5.4-medium" },
        variants: {
          high: {
            reasoning: { effort: "high" },
            options: { cursorModel: "gpt-5.4-high" },
          },
        },
      },
    });

    expect(catalog.resolveWireModel("gpt-5.4", "high")).toBe("gpt-5.4-high");
    expect(
      resolveWireModelFromRequest(catalog, "cursor/gpt-5.4", { reasoning: { effort: "high" } }),
    ).toBe("gpt-5.4-high");
  });

  it("falls back to family-effort wire id when variant has no cursorModel option", () => {
    const catalog = buildKiloCatalogFromConfigModels({
      "cursor-grok-4.6": {
        variants: {
          high: { reasoning: { effort: "high" } },
        },
      },
    });

    expect(
      resolveWireModelFromRequest(catalog, "cursor/cursor-grok-4.6", { reasoning: { effort: "high" } }),
    ).toBe("cursor-grok-4.6-high");
  });

  it("normalizes duplicate cursor/ prefix to auto wire id", () => {
    const catalog = buildKiloCatalogFromConfigModels({
      "auto": {
        options: { cursorModel: "auto" },
      },
    });

    expect(
      resolveWireModelFromRequest(catalog, "cursor/cursor/auto", {}),
    ).toBe("auto");
  });
});
