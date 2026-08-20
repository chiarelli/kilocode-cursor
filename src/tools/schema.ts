import { createLogger } from "../utils/logger";

const log = createLogger("tools:schema");

// Convert JSON Schema from OpenCode to OpenAI function parameters shape
export function toOpenAiParameters(schema: any): any {
  if (!schema || typeof schema !== "object") {
    return { type: "object", properties: {} };
  }

  const clone = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(clone);
    if (obj && typeof obj === "object") {
      const out: any = {};
      for (const k of Object.keys(obj)) {
        out[k] = clone(obj[k]);
      }
      return out;
    }
    return obj;
  };

  const cleaned = clone(schema);

  // Strip unsupported keywords that can confuse OpenAI tools
  const stripKeys = ["additionalProperties", "$schema", "$id", "unevaluatedProperties", "definitions", "$defs"];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    for (const key of stripKeys) {
      if (key in node) delete node[key];
    }
    if (node.properties) {
      for (const k of Object.keys(node.properties)) {
        walk(node.properties[k]);
      }
    }
    if (node.items) walk(node.items);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(walk);
    if (Array.isArray(node.oneOf)) node.oneOf.forEach(walk);
    if (Array.isArray(node.allOf)) node.allOf.forEach(walk);
  };
  walk(cleaned);

  // Ensure top-level object
  if (cleaned.type !== "object") {
    cleaned.type = "object";
    if (!cleaned.properties) cleaned.properties = {};
  }
  if (!Array.isArray(cleaned.required)) cleaned.required = [];

  return cleaned;
}

export function describeTool(t: { id: string; description?: string }): string {
  const base = t.description || "OpenCode tool";
  // Keep concise
  return base.length > 400 ? base.slice(0, 400) : base;
}
