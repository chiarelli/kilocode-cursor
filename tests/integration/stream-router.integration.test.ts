import { describe, it, expect } from "bun:test";
import { ToolRouter } from "../../src/tools/router.js";
import { StreamToSseConverter } from "../../src/streaming/openai-sse.js";
import { parseStreamJsonLine } from "../../src/streaming/parser.js";

// Simulate a cursor-agent stream with a tool_call and ensure router injects a tool_result chunk

describe("Stream + ToolRouter end-to-end", () => {
  it("injects tool_result into SSE stream", async () => {
    const toolsByName = new Map();
    toolsByName.set("oc_brainstorm", { id: "brainstorm", name: "oc_brainstorm", description: "", parameters: {} });

    const execute = async (toolId: string, args: any) => ({
      status: "success",
      output: JSON.stringify({ toolId, args }),
    });

    const router = new ToolRouter({ execute, toolsByName });
    const converter = new StreamToSseConverter("cursor", { id: "chunk-1", created: 123 });

    const toolCallEvent = {
      type: "tool_call",
      call_id: "call-1",
      name: "oc_brainstorm",
      tool_call: { oc_brainstorm: { args: { topic: "pong" } } },
    };

    const sse = converter.handleEvent(toolCallEvent);

    // Router injects an extra chunk
    const toolResult = await router.handleToolCall(toolCallEvent as any, { id: "chunk-1", created: 123, model: "cursor" });

    expect(toolResult).not.toBeNull();
    expect(toolResult?.choices[0].delta.tool_calls[0].function.name).toBe("oc_brainstorm");
    expect(toolResult?.choices[0].delta.tool_calls[0].function.arguments).toContain("pong");

    // Ensure converter output still present
    expect(sse.length).toBeGreaterThan(0);
  });

  it("handles multiple tool_calls with distinct call_ids", async () => {
    const toolsByName = new Map();
    toolsByName.set("oc_one", { id: "one", name: "oc_one", description: "", parameters: {} });
    toolsByName.set("oc_two", { id: "two", name: "oc_two", description: "", parameters: {} });

    const execute = async (toolId: string, args: any) => ({
      status: "success",
      output: JSON.stringify({ toolId, args }),
    });

    const router = new ToolRouter({ execute, toolsByName });

    const events = [
      { type: "tool_call", call_id: "call-1", name: "oc_one", tool_call: { oc_one: { args: { a: 1 } } } },
      { type: "tool_call", call_id: "call-2", name: "oc_two", tool_call: { oc_two: { args: { b: 2 } } } },
    ];

    const results = await Promise.all(
      events.map((ev) => router.handleToolCall(ev as any, { id: "chunk", created: 123, model: "cursor" }))
    );

    expect(results[0]?.choices[0].delta.tool_calls[0].id).toBe("call-1");
    expect(results[1]?.choices[0].delta.tool_calls[0].id).toBe("call-2");

    const args1Str = results[0]?.choices[0].delta.tool_calls[0].function.arguments || "{}";
    const args2Str = results[1]?.choices[0].delta.tool_calls[0].function.arguments || "{}";
    const args1 = JSON.parse(args1Str);
    const args2 = JSON.parse(args2Str);

    expect(args1.result).toContain("\"toolId\":\"one\"");
    expect(args1.result).toContain("\"a\":1");
    expect(args2.result).toContain("\"toolId\":\"two\"");
    expect(args2.result).toContain("\"b\":2");
  });
});
