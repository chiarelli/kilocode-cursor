import type { ToolHandler, Tool } from "./types.js";

interface RegisteredTool {
  tool: Tool;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: Tool, handler: ToolHandler): void {
    this.tools.set(tool.name, { tool, handler });
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name)?.tool;
  }

  list(): Tool[] {
    return Array.from(this.tools.values()).map((t) => t.tool);
  }
}

