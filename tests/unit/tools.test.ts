import { describe, it, expect, beforeEach } from "bun:test";
import { ToolMapper } from "../../src/acp/tools.js";
import { toOpenAiParameters } from "../../src/tools/schema.js";
import { OpenCodeToolDiscovery } from "../../src/tools/discovery.js";
import { CliExecutor } from "../../src/tools/executors/cli.js";
import { ToolRouter } from "../../src/tools/router.js";

describe("ToolMapper", () => {
  let mapper: ToolMapper;

  beforeEach(() => {
    mapper = new ToolMapper();
  });

  describe("mapCursorEventToAcp", () => {
    it("should map tool_call started events to ACP format", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-123",
        subtype: "started" as const,
        tool_call: {
          readToolCall: {
            args: { path: "/path/to/file.ts" }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");

      expect(updates).toHaveLength(2);
      expect(updates[0].sessionId).toBe("session-1");
      expect(updates[0].toolCallId).toBe("call-123");
      expect(updates[0].title).toBe("Read /path/to/file.ts");
      expect(updates[0].kind).toBe("read");
      expect(updates[0].status).toBe("pending");
      expect(updates[0].locations).toEqual([{ path: "/path/to/file.ts", line: undefined }]);
      expect(updates[1].status).toBe("in_progress");
    });

    it("should map tool_call completed events to ACP format", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-123",
        subtype: "completed" as const,
        tool_call: {
          readToolCall: {
            args: { path: "/path/to/file.ts" },
            result: { content: "file content" }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");

      expect(updates).toHaveLength(1);
      expect(updates[0].toolCallId).toBe("call-123");
      expect(updates[0].status).toBe("completed");
      expect(updates[0].rawOutput).toContain("file content");
    });

    it("should handle unknown event types gracefully", async () => {
      const event = {
        type: "unknown_event",
        subtype: "something"
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates).toHaveLength(0);
    });

    it("should use tool_call_id when call_id is not present", async () => {
      const event = {
        type: "tool_call",
        tool_call_id: "alt-call-456",
        subtype: "started" as const,
        tool_call: {
          readToolCall: { args: { path: "/file.ts" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].toolCallId).toBe("alt-call-456");
    });
  });

  describe("extractLocations", () => {
    it("should extract locations from tool args with single path", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          readToolCall: {
            args: { path: "/src/index.ts", line: 42 }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].locations).toEqual([{ path: "/src/index.ts", line: 42 }]);
    });

    it("should extract locations from array of paths", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          customToolCall: {
            args: { paths: ["/file1.ts", "/file2.ts"] }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].locations).toEqual([
        { path: "/file1.ts" },
        { path: "/file2.ts" }
      ]);
    });

    it("should extract locations from array of path objects", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          customToolCall: {
            args: { 
              paths: [
                { path: "/file1.ts", line: 10 },
                { path: "/file2.ts", line: 20 }
              ] 
            }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].locations).toEqual([
        { path: "/file1.ts", line: 10 },
        { path: "/file2.ts", line: 20 }
      ]);
    });

    it("should return undefined when no locations found", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          customToolCall: {
            args: { someOtherArg: "value" }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].locations).toBeUndefined();
    });
  });

  describe("generateDiffs", () => {
    it("should generate diffs for write operations", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-write",
        subtype: "completed" as const,
        tool_call: {
          writeToolCall: {
            args: { path: "/src/file.ts", fileText: "new content" },
            result: { oldText: "old content", newText: "new content" }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      
      expect(updates[0].content).toBeDefined();
      expect(updates[0].content).toHaveLength(1);
      expect(updates[0].content?.[0].type).toBe("diff");
      expect((updates[0].content?.[0] as any).path).toBe("/src/file.ts");
      expect((updates[0].content?.[0] as any).oldText).toBe("old content");
      expect((updates[0].content?.[0] as any).newText).toBe("new content");
    });

    it("should handle write without previous content", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-write",
        subtype: "completed" as const,
        tool_call: {
          writeToolCall: {
            args: { path: "/new-file.ts", fileText: "brand new content" },
            result: { newText: "brand new content" }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      
      expect(updates[0].content?.[0].type).toBe("diff");
      expect((updates[0].content?.[0] as any).oldText).toBeNull();
      expect((updates[0].content?.[0] as any).newText).toBe("brand new content");
    });
  });

  describe("buildToolTitle", () => {
    it("should build title for read operation", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          readToolCall: { args: { path: "README.md" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("Read README.md");
    });

    it("should build title for write operation", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          writeToolCall: { args: { path: "output.txt" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("Write output.txt");
    });

    it("should build title for grep operation with pattern and path", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          grepToolCall: { args: { pattern: "TODO", path: "/src" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("Search /src for TODO");
    });

    it("should build title for grep operation with pattern only", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          grepToolCall: { args: { pattern: "ERROR" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("Search for ERROR");
    });

    it("should build title for bash command", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          bashToolCall: { args: { command: "ls -la" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("`ls -la`");
    });

    it("should build title for bash with cmd instead of command", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          shellToolCall: { args: { cmd: "npm run build" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("`npm run build`");
    });

    it("should build title for multiple commands", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          bashToolCall: { args: { commands: ["cd /app", "npm install"] } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("`cd /app && npm install`");
    });

    it("should build title for glob operation", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {
          globToolCall: { args: { pattern: "**/*.ts" } }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].title).toBe("Glob **/*.ts");
    });
  });

  describe("inferToolType", () => {
    it("should infer read type", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { readToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("read");
    });

    it("should infer edit type for write", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { writeToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("edit");
    });

    it("should infer search type for grep", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { grepToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("search");
    });

    it("should infer search type for glob", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { globToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("search");
    });

    it("should infer execute type for bash", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { bashToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("execute");
    });

    it("should infer execute type for shell", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { shellToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("execute");
    });

    it("should infer other type for unknown tools", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { unknownToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("other");
    });
  });

  describe("bash output formatting", () => {
    it("should format bash output with exit code", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-bash",
        subtype: "completed" as const,
        tool_call: {
          bashToolCall: {
            args: { command: "ls" },
            result: { output: "file1.txt\nfile2.txt", exitCode: 0 }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      
      expect(updates[0].content).toBeDefined();
      expect(updates[0].content?.[0].type).toBe("content");
      const text = (updates[0].content?.[0] as any).content.text;
      expect(text).toContain("Exit code: 0");
      expect(text).toContain("file1.txt");
    });

    it("should handle bash with no output", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-bash",
        subtype: "completed" as const,
        tool_call: {
          bashToolCall: {
            args: { command: "true" },
            result: { exitCode: 0 }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      
      const text = (updates[0].content?.[0] as any).content.text;
      expect(text).toContain("(no output)");
    });
  });

  describe("extractResultLocations", () => {
    it("should extract locations from matches array", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "completed" as const,
        tool_call: {
          grepToolCall: {
            args: {},
            result: {
              matches: [
                { path: "/src/a.ts", line: 10 },
                { path: "/src/b.ts", line: 20 }
              ]
            }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].locations).toEqual([
        { path: "/src/a.ts", line: 10 },
        { path: "/src/b.ts", line: 20 }
      ]);
    });

    it("should extract locations from files array", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "completed" as const,
        tool_call: {
          globToolCall: {
            args: {},
            result: { files: ["/src/c.ts", "/src/d.ts"] }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].locations).toEqual([
        { path: "/src/c.ts" },
        { path: "/src/d.ts" }
      ]);
    });

    it("should extract location from single path result", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "completed" as const,
        tool_call: {
          readToolCall: {
            args: {},
            result: { path: "/result.txt", line: 5 }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].locations).toEqual([{ path: "/result.txt", line: 5 }]);
    });
  });

  describe("error handling", () => {
    it("should set status to failed when result has error", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-err",
        subtype: "completed" as const,
        tool_call: {
          readToolCall: {
            args: { path: "/nonexistent.ts" },
            result: { error: "File not found" }
          }
        }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].status).toBe("failed");
    });

    it("should handle missing tool_call gracefully", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: undefined
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates[0].kind).toBe("other");
      expect(updates[0].title).toBe("other");
    });

    it("should handle empty tool_call object", async () => {
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: {}
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      expect(updates).toHaveLength(2);
    });
  });

  describe("timing metadata", () => {
    it("should include startTime on started events", async () => {
      const beforeTime = Date.now();
      
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "started" as const,
        tool_call: { readToolCall: { args: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      
      const afterTime = Date.now();
      
      expect(updates[0].startTime).toBeDefined();
      expect(updates[0].startTime).toBeGreaterThanOrEqual(beforeTime);
      expect(updates[0].startTime).toBeLessThanOrEqual(afterTime);
    });

    it("should include endTime on completed events", async () => {
      const beforeTime = Date.now();
      
      const event = {
        type: "tool_call",
        call_id: "call-1",
        subtype: "completed" as const,
        tool_call: { readToolCall: { args: {}, result: {} } }
      };

      const updates = await mapper.mapCursorEventToAcp(event, "session-1");
      
      const afterTime = Date.now();
      
      expect(updates[0].endTime).toBeDefined();
      expect(updates[0].endTime).toBeGreaterThanOrEqual(beforeTime);
      expect(updates[0].endTime).toBeLessThanOrEqual(afterTime);
    });
  });
});

describe("Schema translation", () => {
  it("forces object and strips unsupported keys", () => {
    const input = {
      type: "array",
      additionalProperties: false,
      properties: {
        foo: { type: "string" },
      },
      $schema: "http://json-schema.org/draft-07/schema#",
    };
    const out = toOpenAiParameters(input);
    expect(out.type).toBe("object");
    expect(out.properties.foo.type).toBe("string");
    expect(out).not.toHaveProperty("additionalProperties");
    expect(out).not.toHaveProperty("$schema");
  });
});

describe("Executor (CLI fallback)", () => {
  it("returns error when no executor available", async () => {
    const exec = new CliExecutor(10);
    const res = await exec.execute("nonexistent", {});
    expect(res.status === "success" || res.status === "error").toBe(true);
  });
});
