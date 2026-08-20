import type { Skill } from "../core/types.js";

export class SkillResolver {
  private aliasToName = new Map<string, string>();

  constructor(skills: Skill[]) {
    for (const s of skills) {
      const aliases = new Set<string>([(s.name || "").toLowerCase(), (s.id || "").toLowerCase()]);
      (s.aliases || []).forEach((a) => aliases.add(a.toLowerCase()));
      (s.triggers || []).forEach((t) => aliases.add(t.toLowerCase()));
      for (const a of aliases) {
        this.aliasToName.set(a, s.name);
      }
    }
  }

  resolve(name?: string): string | undefined {
    if (!name) return undefined;
    return this.aliasToName.get(name.toLowerCase());
  }
}
