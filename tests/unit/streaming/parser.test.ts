import { describe, expect, it } from "bun:test";

import { parseStreamJsonLine } from "../../../src/streaming/parser.js";

describe("parseStreamJsonLine", () => {
  it("parses valid stream-json lines", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello" }],
      },
    });

    const event = parseStreamJsonLine(line);

    expect(event).toBeTruthy();
    expect(event?.type).toBe("assistant");
  });

  it("returns null on invalid JSON", () => {
    const event = parseStreamJsonLine("{invalid");

    expect(event).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(parseStreamJsonLine("[]")).toBeNull();
    expect(parseStreamJsonLine("null")).toBeNull();
  });

  it("returns null for empty lines", () => {
    expect(parseStreamJsonLine("\n")).toBeNull();
    expect(parseStreamJsonLine("")).toBeNull();
  });
});
