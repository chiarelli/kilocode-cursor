import { describe, it, expect } from "bun:test";
import { ModelDiscoveryService } from "../../src/models/discovery.js";
import { ConfigUpdater } from "../../src/models/config.js";

describe("Model Discovery Integration", () => {
  it("should discover and format models", async () => {
    const service = new ModelDiscoveryService();
    const updater = new ConfigUpdater();

    const models = await service.discover();
    const formatted = updater.formatModels(models);

    // Verify format
    expect(Object.keys(formatted).length).toBeGreaterThan(0);

    const firstKey = Object.keys(formatted)[0];
    expect(formatted[firstKey].name).toBeDefined();
    expect(formatted[firstKey].tools).toBe(true);
  });

  it("should generate provider config", async () => {
    const service = new ModelDiscoveryService();
    const updater = new ConfigUpdater();

    const models = await service.discover();
    const config = updater.generateProviderConfig(models, "http://localhost:32124/v1");

    expect(config.npm).toBeDefined();
    expect(config.name).toBeDefined();
    expect(config.options?.baseURL).toBe("http://localhost:32124/v1");
    expect(Object.keys(config.models).length).toBeGreaterThan(0);
  });
});