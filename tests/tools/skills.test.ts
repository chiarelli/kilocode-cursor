import { describe, it, expect } from "vitest";
import { SkillLoader } from "../../src/tools/skills/loader";
import { SkillResolver } from "../../src/tools/skills/resolver";
import type { OpenCodeTool } from "../../src/tools/discovery";

describe("SkillLoader", () => {
  it("transforms tools into skills with aliases", () => {
    const tools: OpenCodeTool[] = [
      {
        id: "superpowers/brainstorming",
        name: "brainstorming",
        description: "Help brainstorm ideas",
        parameters: {},
        source: "sdk",
      },
    ];

    const loader = new SkillLoader();
    const skills = loader.load(tools);

    expect(skills).toHaveLength(1);
    const skill = skills[0];
    expect(skill.id).toBe("superpowers/brainstorming");
    expect(skill.name).toBe("brainstorming");
    expect(skill.aliases).toContain("brainstorming");
    expect(skill.aliases).toContain("oc_skill_superpowers_brainstorming");
    expect(skill.aliases).toContain("oc_superskill_superpowers_brainstorming");
    expect(skill.aliases).toContain("oc_superpowers_superpowers_brainstorming");
  });

  it("derives category from tool name", () => {
    const tools: OpenCodeTool[] = [
      {
        id: "superpowers/brainstorming",
        name: "brainstorming",
        description: "Brainstorm",
        parameters: {},
        source: "sdk",
      },
    ];

    const loader = new SkillLoader();
    const skills = loader.load(tools);
    expect(skills[0].category).toBe("brainstorming");
  });

  it("adds special aliases for todowrite", () => {
    const tools: OpenCodeTool[] = [
      {
        id: "todowrite",
        name: "todowrite",
        description: "Update todos",
        parameters: {},
        source: "sdk",
      },
    ];

    const loader = new SkillLoader();
    const skills = loader.load(tools);
    expect(skills[0].aliases).toContain("updateTodos");
    expect(skills[0].aliases).toContain("todoWrite");
  });
});

describe("SkillResolver", () => {
  it("resolves exact skill name", () => {
    const skills = [
      {
        id: "skill-1",
        name: "mytool",
        description: "Test",
        parameters: {},
        source: "sdk" as const,
      },
    ];

    const resolver = new SkillResolver(skills);
    expect(resolver.resolve("mytool")).toBe("mytool");
  });

  it("resolves case-insensitively", () => {
    const skills = [
      {
        id: "skill-1",
        name: "MyTool",
        description: "Test",
        parameters: {},
        source: "sdk" as const,
      },
    ];

    const resolver = new SkillResolver(skills);
    expect(resolver.resolve("mytool")).toBe("MyTool");
    expect(resolver.resolve("MYTOOL")).toBe("MyTool");
  });

  it("resolves aliases", () => {
    const skills = [
      {
        id: "skill-1",
        name: "brainstorming",
        description: "Brainstorm",
        parameters: {},
        source: "sdk" as const,
        aliases: ["oc_skill_brainstorming", "bs"],
      },
    ];

    const resolver = new SkillResolver(skills);
    expect(resolver.resolve("oc_skill_brainstorming")).toBe("brainstorming");
    expect(resolver.resolve("bs")).toBe("brainstorming");
  });

  it("resolves triggers", () => {
    const skills = [
      {
        id: "skill-1",
        name: "mytool",
        description: "Test",
        parameters: {},
        source: "sdk" as const,
        triggers: ["helper", "assist"],
      },
    ];

    const resolver = new SkillResolver(skills);
    expect(resolver.resolve("helper")).toBe("mytool");
    expect(resolver.resolve("assist")).toBe("mytool");
  });

  it("returns undefined for unknown names", () => {
    const resolver = new SkillResolver([]);
    expect(resolver.resolve("unknown")).toBeUndefined();
    expect(resolver.resolve(undefined)).toBeUndefined();
  });
});
