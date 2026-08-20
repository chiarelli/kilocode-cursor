import type { OpenCodeTool } from "../discovery.js";
import type { Skill } from "../core/types.js";

function deriveCategory(name: string): string | undefined {
  if (!name) return undefined;
  const segments = name.split(/[\/:]/).filter(Boolean);
  if (segments.length === 0) return undefined;
  // Prefer last segment as the skill topic (e.g., superpowers/brainstorming -> brainstorming)
  return segments[segments.length - 1].toLowerCase();
}

function deriveTriggers(name: string, description?: string): string[] {
  const words = new Set<string>();
  const addWord = (w: string) => {
    const word = w.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (word.length >= 4) words.add(word);
  };

  name.split(/[\s\/:_-]+/).forEach(addWord);
  (description || "")
    .split(/[\s,.;:()]+/)
    .filter((w) => w.length >= 4)
    .slice(0, 12)
    .forEach(addWord);

  return Array.from(words).slice(0, 6);
}

export class SkillLoader {
  load(tools: OpenCodeTool[]): Skill[] {
    return tools.map((t) => {
      const baseId = t.id.replace(/[^a-zA-Z0-9_\-]/g, "_");
      const aliases = [
        t.name,
        baseId,
        `oc_${baseId}`,
        `oc_skill_${baseId}`,
        `oc_superskill_${baseId}`,
        `oc_superpowers_${baseId}`,
      ];
      if (t.name === "todowrite") {
        aliases.push("updateTodos", "updateTodosToolCall", "todoWrite", "todoWriteToolCall");
      }
      if (t.name === "todoread") {
        aliases.push("readTodos", "readTodosToolCall", "todoRead", "todoReadToolCall");
      }
      const category = deriveCategory(t.name);
      const triggers = deriveTriggers(t.name, t.description);
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        source: t.source,
        aliases,
        category,
        triggers,
      };
    });
  }
}
