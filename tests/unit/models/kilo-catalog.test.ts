import { describe, expect, it } from "bun:test";
import {
  buildKiloCatalogFromConfigModels,
  buildKiloModelCatalog,
  mergeKiloModelCatalog,
  resolveWireModelFromRequest,
} from "../../../src/models/kilo-catalog.js";

describe("kilo-catalog", () => {
  it("groups flat effort variants into cursor/ entries with reasoning variants", () => {
    const discovered = [
      { id: "claude-fable-5", name: "Claude Fable 5" },
      { id: "claude-fable-5-low", name: "Claude Fable 5 Low" },
      { id: "claude-fable-5-medium", name: "Claude Fable 5 Medium" },
      { id: "claude-fable-5-high", name: "Claude Fable 5 High" },
      { id: "claude-fable-5-max", name: "Claude Fable 5 Max" },
      { id: "claude-fable-5-thinking-low", name: "Claude Fable 5 Thinking Low" },
      { id: "claude-fable-5-thinking-high", name: "Claude Fable 5 Thinking High" },
    ];

    const { models } = buildKiloModelCatalog(discovered);

    expect(models["claude-fable-5"]).toBeDefined();
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
