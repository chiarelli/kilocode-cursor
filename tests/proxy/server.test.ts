import { describe, it, expect } from "bun:test";
import { createProxyServer, findAvailablePort } from "../../src/proxy/server.js";

describe("findAvailablePort", () => {
  it("should return a port in the valid range", async () => {
    const port = await findAvailablePort();
    expect(port).toBeGreaterThanOrEqual(32124);
    expect(port).toBeLessThan(32124 + 256);
  });

  it("should return different port when first is occupied", async () => {
    const port1 = await findAvailablePort();
    const server = createProxyServer({ port: port1 });
    await server.start();

    const port2 = await findAvailablePort();
    expect(port2).not.toBe(port1);

    await server.stop();
  });
});

describe("ProxyServer", () => {
  it("should start on requested port", async () => {
    const port = await findAvailablePort();
    const server = createProxyServer({ port });
    const baseURL = await server.start();
    expect(baseURL).toBe(`http://127.0.0.1:${port}/v1`);
    await server.stop();
  });

  it("should respond to health check", async () => {
    const port = await findAvailablePort();
    const server = createProxyServer({ port });
    await server.start();
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    await server.stop();
  });

  it("should return correct port from getPort()", async () => {
    const port = await findAvailablePort();
    const server = createProxyServer({ port });

    // Before start, should return null
    expect(server.getPort()).toBe(null);

    await server.start();
    expect(server.getPort()).toBe(port);

    await server.stop();
    // After stop, should return null
    expect(server.getPort()).toBe(null);
  });

  it("should fallback to available port when requested port is busy", async () => {
    const port = await findAvailablePort();

    // Start first server on the port
    const server1 = createProxyServer({ port });
    await server1.start();

    // Try to start second server on same port - should fallback
    const server2 = createProxyServer({ port });
    const baseURL = await server2.start();

    // Should have started on a different port
    expect(server2.getPort()).not.toBe(port);
    expect(baseURL).not.toContain(`:${port}/`);

    await server2.stop();
    await server1.stop();
  });

  it("should auto-assign port when port is 0 or not specified", async () => {
    const server = createProxyServer({ port: 0 });
    const baseURL = await server.start();

    const port = server.getPort();
    expect(port).toBeGreaterThanOrEqual(32124);
    expect(port).toBeLessThan(32124 + 256);
    expect(baseURL).toBe(`http://127.0.0.1:${port}/v1`);

    await server.stop();
  });

  it("should be idempotent - calling start() twice returns same baseURL", async () => {
    const port = await findAvailablePort();
    const server = createProxyServer({ port });

    const url1 = await server.start();
    const url2 = await server.start();

    expect(url1).toBe(url2);
    expect(server.getPort()).toBe(port);

    await server.stop();
  });

  it("should handle stop() when never started", async () => {
    const server = createProxyServer({ port: 32200 });
    // Should not throw
    await server.stop();
    expect(server.getPort()).toBe(null);
  });

  it("should return empty string from getBaseURL() after stop", async () => {
    const port = await findAvailablePort();
    const server = createProxyServer({ port });

    await server.start();
    expect(server.getBaseURL()).toContain(`${port}`);

    await server.stop();
    expect(server.getBaseURL()).toBe("");
  });
});
