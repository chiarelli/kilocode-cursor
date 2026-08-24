import { describe, it, expect } from "bun:test";
import { buildAvailableToolsSystemMessage } from "../../src/plugin.js";

describe("buildAvailableToolsSystemMessage", () => {
  it("includes Kilo subagents from the task tool roster when provided", () => {
    const msg = buildAvailableToolsSystemMessage(
      ["task", "read"],
      [{ id: "task", name: "task" }],
      [],
      [],
      [
        { name: "adversarial", description: "Red-team reviewer for risky changes" },
        { name: "image-describer", description: "Describes images for non-vision models" },
      ],
    );

    expect(msg).toContain("Registered Kilo subagents:");
    expect(msg).toContain("- adversarial: Red-team reviewer for risky changes");
    expect(msg).toContain("- image-describer: Describes images for non-vision models");
    expect(msg).toContain("Never use subagentType");
    expect(msg).toContain('{ custom: "name" }');
  });

  it("returns null when no tools or subagents are available", () => {
    const msg = buildAvailableToolsSystemMessage([], [], [], []);
    expect(msg).toBeNull();
  });
});
