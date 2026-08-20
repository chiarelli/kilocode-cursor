import { describe, it, expect } from "bun:test";
import { readFile } from "fs/promises";
import { StreamToAiSdkParts } from "../../src/streaming/ai-sdk-parts.js";
import { StreamToSseConverter } from "../../src/streaming/openai-sse.js";
import { parseStreamJsonLine } from "../../src/streaming/parser.js";

const readFixture = async (name: string) => {
  const content = await readFile(`tests/fixtures/${name}`, "utf8");
  return content.trim().split("\n");
};

describe("Stream JSON Integration", () => {
  it("converts assistant stream to SSE chunks", async () => {
    const lines = await readFixture("stream-json-basic.ndjson");
    const converter = new StreamToSseConverter("cursor-agent", { id: "test", created: 123 });
    const chunks: string[] = [];

    for (const line of lines) {
      const event = parseStreamJsonLine(line);
      if (!event) continue;
      chunks.push(...converter.handleEvent(event));
    }

    const output = chunks.join("");
    expect(output).toContain("chat.completion.chunk");
    expect(output).toContain("content");
  });

  it("emits tool call deltas from fixture", async () => {
    const lines = await readFixture("stream-json-tool-call.ndjson");
    const converter = new StreamToSseConverter("cursor-agent", { id: "test", created: 123 });
    const chunks: string[] = [];

    for (const line of lines) {
      const event = parseStreamJsonLine(line);
      if (!event) continue;
      chunks.push(...converter.handleEvent(event));
    }

    const output = chunks.join("");
    expect(output).toContain("tool_calls");
    expect(output).toContain("read");
  });

  it("builds ai-sdk parts for tool calls and results", async () => {
    const lines = await readFixture("stream-json-tool-call.ndjson");
    const converter = new StreamToAiSdkParts();
    const parts: Array<{ type: string }> = [];

    for (const line of lines) {
      const event = parseStreamJsonLine(line);
      if (!event) continue;
      parts.push(...converter.handleEvent(event));
    }

    const types = parts.map((part) => part.type);
    expect(types).toContain("tool-call-streaming-start");
    expect(types).toContain("tool-call-delta");
    expect(types).toContain("tool-input-available");
  });

  it("parses error result events", async () => {
    const lines = await readFixture("stream-json-error.ndjson");
    const events = lines.map(parseStreamJsonLine).filter(Boolean) as Array<{ type: string; is_error?: boolean }>;
    const resultEvent = events.find((event) => event.type === "result");

    expect(resultEvent).toBeDefined();
    expect(resultEvent?.is_error).toBe(true);
  });
});
