import { describe, it, expect } from "bun:test";

class RetryEngine {
  async execute<T>(
    fn: () => Promise<T>,
    options: { maxRetries?: number; backoffMs?: number; shouldRetry?: (error: Error) => boolean } = {}
  ): Promise<T> {
    const { maxRetries = 3, backoffMs = 1000, shouldRetry = () => true } = options;

    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries || !shouldRetry(lastError)) {
          throw lastError;
        }

        const delay = backoffMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30000): number {
    const delay = baseMs * Math.pow(2, attempt);
    return Math.min(delay, maxMs);
  }
}

describe("RetryEngine", () => {
  const engine = new RetryEngine();

  it("should succeed on first attempt", async () => {
    const result = await engine.execute(async () => "success");
    expect(result).toBe("success");
  });

  it("should retry on recoverable errors", async () => {
    let attempts = 0;
    const result = await engine.execute(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("transient error");
        }
        return "success";
      },
      { maxRetries: 3, backoffMs: 10 }
    );
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("should not retry on fatal errors", async () => {
    let attempts = 0;

    await expect(
      engine.execute(
        async () => {
          attempts++;
          throw new Error("fatal error");
        },
        {
          maxRetries: 3,
          backoffMs: 10,
          shouldRetry: (error) => !error.message.includes("fatal")
        }
      )
    ).rejects.toThrow("fatal error");

    expect(attempts).toBe(1);
  });

  it("should calculate exponential backoff", () => {
    expect(engine.calculateBackoff(0, 1000)).toBe(1000);
    expect(engine.calculateBackoff(1, 1000)).toBe(2000);
    expect(engine.calculateBackoff(2, 1000)).toBe(4000);
    expect(engine.calculateBackoff(10, 1000, 30000)).toBe(30000);
  });

  it("should throw after max retries exceeded", async () => {
    let attempts = 0;

    await expect(
      engine.execute(
        async () => {
          attempts++;
          throw new Error("always fails");
        },
        { maxRetries: 2, backoffMs: 10 }
      )
    ).rejects.toThrow("always fails");

    expect(attempts).toBe(3); // initial + 2 retries
  });
});
