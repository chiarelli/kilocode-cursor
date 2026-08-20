/**
 * PassThroughTracker - Tracks MCP tools passed through to cursor-agent
 *
 * Used to collect tool names for end-of-response toast notifications
 * when cursor-agent MCP tools (like Playwright) are invoked.
 */

export interface PassThroughSummary {
  tools: string[];
  errors: string[];
  hasActivity: boolean;
}

export class PassThroughTracker {
  private tools: Set<string> = new Set();
  private errors: string[] = [];

  trackTool(name: string): void {
    this.tools.add(name);
  }

  trackError(toolName: string, message: string): void {
    this.errors.push(`${toolName}: ${message}`);
  }

  getSummary(): PassThroughSummary {
    return {
      tools: Array.from(this.tools),
      errors: [...this.errors],
      hasActivity: this.tools.size > 0,
    };
  }

  reset(): void {
    this.tools.clear();
    this.errors.length = 0;
  }
}