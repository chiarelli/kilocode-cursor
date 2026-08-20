import { describe, it, expect } from "bun:test";
import { ModelDiscoveryService } from "../../src/models/discovery.js";

describe("ModelDiscoveryService", () => {
  it("should discover models from cursor-agent", async () => {
    const service = new ModelDiscoveryService();
    const models = await service.discover();

    // Should return array of models
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    // Each model should have id and name
    const firstModel = models[0];
    expect(firstModel.id).toBeDefined();
    expect(firstModel.name).toBeDefined();
  });

  it("should cache discovered models", async () => {
    const service = new ModelDiscoveryService({ cacheTTL: 60000 });

    // First discovery
    const models1 = await service.discover();

    // Second discovery should return cached
    const models2 = await service.discover();

    expect(models1).toEqual(models2);
  });

  it("should return fallback models on error", async () => {
    const service = new ModelDiscoveryService({
      fallbackModels: [
        { id: "test", name: "Test Model" }
      ]
    });

    const models = await service.discover();
    expect(models.length).toBeGreaterThan(0);
  });
});