import { describe, expect, it } from "bun:test";

import { LineBuffer } from "../../../src/streaming/line-buffer.js";

describe("LineBuffer", () => {
  it("buffers partial lines", () => {
    const buffer = new LineBuffer();

    expect(buffer.push("a")).toEqual([]);
    expect(buffer.push("\n")).toEqual(["a"]);
    expect(buffer.push("b\nc")).toEqual(["b"]);
    expect(buffer.flush()).toEqual(["c"]);
  });

  it("handles CRLF line endings", () => {
    const buffer = new LineBuffer();

    expect(buffer.push("a\r\nb\r\n")).toEqual(["a", "b"]);
    expect(buffer.flush()).toEqual([]);
  });

  it("ignores empty lines", () => {
    const buffer = new LineBuffer();

    expect(buffer.push("\n\n")).toEqual([]);
    expect(buffer.flush()).toEqual([]);
  });

  it("flushes remaining buffered content", () => {
    const buffer = new LineBuffer();

    expect(buffer.push("tail")).toEqual([]);
    expect(buffer.flush()).toEqual(["tail"]);
    expect(buffer.flush()).toEqual([]);
  });

  it("accepts Uint8Array input", () => {
    const buffer = new LineBuffer();
    const encoder = new TextEncoder();

    expect(buffer.push(encoder.encode("x\n"))).toEqual(["x"]);
  });
});
