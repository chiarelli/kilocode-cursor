import { describe, it, expect } from "bun:test";
import { ConfigUpdater } from "../../src/models/config.js";
import type { ModelInfo } from "../../src/models/types.js";

describe("ConfigUpdater", () => {
  it("should format models for opencode config", () => {
    const updater = new ConfigUpdater();
    const models: ModelInfo[] = [
      { id: "auto", name: "Auto" },
      { id: "gpt-5.2", name: "GPT-5.2" }
    ];

    const formatted = updater.formatModels(models);

    expect(formatted.auto).toBeDefined();
    expect(formatted.auto.name).toBe("Auto");
    expect(formatted.auto.tools).toBe(true);
    expect(formatted.auto.reasoning).toBe(true);
  });

  it("should normalize model IDs", () => {
    const updater = new ConfigUpdater();
    const models: ModelInfo[] = [
      { id: "gpt-5.2", name: "GPT-5.2" },
      { id: "sonnet-4.5", name: "Sonnet 4.5" }
    ];

    const formatted = updater.formatModels(models);

    // IDs with dots/dashes should be normalized
    expect(formatted.gpt52).toBeDefined();
    expect(formatted.sonnet45).toBeDefined();
  });

  it("should preserve existing models", () => {
    const updater = new ConfigUpdater();
    const existing = {
      auto: { name: "Auto", custom: true },
      custom: { name: "Custom", tools: true }
    };

    const newModels: ModelInfo[] = [{ id: "gpt-5.2", name: "GPT-5.2" }];
    const merged = updater.mergeModels(existing, newModels);

    expect(merged.auto.custom).toBe(true); // Preserved
    expect(merged.gpt52).toBeDefined(); // Added
    expect(merged.custom).toBeDefined(); // Preserved
  });
});