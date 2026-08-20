export interface ExecutionResult {
  status: "success" | "error";
  output?: string;
  error?: string;
  errorType?: "recoverable" | "fatal";
}

export interface IToolExecutor {
  canExecute(toolId: string): boolean;
  execute(toolId: string, args: Record<string, unknown>): Promise<ExecutionResult>;
}

export interface ToolHandler {
  (args: Record<string, unknown>): Promise<string>;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  parameters: any;
  source: "sdk" | "cli" | "local" | "mcp";
}

export interface Skill extends Tool {
  aliases?: string[];
  category?: string;
  triggers?: string[];
  prerequisites?: string[];
}

