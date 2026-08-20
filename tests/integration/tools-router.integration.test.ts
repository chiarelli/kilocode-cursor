import { describe, it, expect } from "bun:test";
import { ToolRouter } from "../../src/tools/router.js";

// A stub executor that just echoes args
const execute = async (toolId: string, args: any) => ({
  status: "success",
  output: JSON.stringify({ toolId, args }),
});

describe("ToolRouter integration", () => {
  it("handles a tool_call and returns a tool_result chunk", async () => {
    const toolsByName = new Map();
    toolsByName.set("oc_brainstorm", { id: "brainstorm", name: "oc_brainstorm", description: "", parameters: {} });

    const router = new ToolRouter({ execute, toolsByName });
    const event: any = {
      type: "tool_call",
      call_id: "call-1",
      name: "oc_brainstorm",
      tool_call: {
        oc_brainstorm: { args: { topic: "pong" } }
      }
    };

    const res = await router.handleToolCall(event, { id: "chunk-1", created: 123, model: "cursor" });
    expect(res).not.toBeNull();
    expect(res?.choices[0].delta.tool_calls[0].function.name).toBe("oc_brainstorm");
    expect(res?.choices[0].delta.tool_calls[0].function.arguments).toContain("pong");
  });
});
