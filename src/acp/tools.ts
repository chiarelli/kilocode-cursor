export interface ToolUpdate {
  sessionId: string;
  toolCallId: string;
  title?: string;
  kind?: 'read' | 'write' | 'edit' | 'search' | 'execute' | 'other';
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  locations?: Array<{ path: string; line?: number }>;
  content?: Array<{ type: string; [key: string]: unknown }>;
  rawOutput?: string;
  startTime?: number;
  endTime?: number;
}

interface CursorEvent {
  type: string;
  call_id?: string;
  tool_call_id?: string;
  subtype?: string;
  tool_call?: {
    [key: string]: {
      args?: Record<string, unknown>;
      result?: Record<string, unknown>;
    };
  };
}

export class ToolMapper {
  async mapCursorEventToAcp(event: CursorEvent, sessionId: string): Promise<ToolUpdate[]> {
    if (event.type !== 'tool_call') {
      return [];
    }

    const updates: ToolUpdate[] = [];
    const toolCallId = event.call_id || event.tool_call_id || 'unknown';
    const subtype = event.subtype || 'started';

    // Completed/failed events return 1 update with results
    if (subtype === 'completed' || subtype === 'failed') {
      const result = this.extractResult(event.tool_call || {});
      const locations = result.locations?.length ? result.locations : this.extractLocations(event.tool_call || {});

      updates.push({
        sessionId,
        toolCallId,
        title: this.buildToolTitle(event.tool_call || {}),
        kind: this.inferToolType(event.tool_call || {}),
        status: result.error ? 'failed' : 'completed',
        content: result.content,
        locations,
        rawOutput: result.rawOutput,
        endTime: Date.now()
      });
    } else {
      // Started events return 2 updates: pending and in_progress
      updates.push({
        sessionId,
        toolCallId,
        title: this.buildToolTitle(event.tool_call || {}),
        kind: this.inferToolType(event.tool_call || {}),
        status: 'pending',
        locations: this.extractLocations(event.tool_call || {}),
        startTime: Date.now()
      });

      updates.push({
        sessionId,
        toolCallId,
        status: 'in_progress'
      });
    }

    return updates;
  }

  private inferToolType(toolCall: Record<string, unknown>): ToolUpdate['kind'] {
    const keys = Object.keys(toolCall);
    for (const key of keys) {
      if (key.includes('read')) return 'read';
      if (key.includes('write')) return 'edit';
      if (key.includes('grep') || key.includes('glob')) return 'search';
      if (key.includes('bash') || key.includes('shell')) return 'execute';
    }
    return 'other';
  }

  private buildToolTitle(toolCall: Record<string, unknown>): string {
    const keys = Object.keys(toolCall);
    for (const key of keys) {
      const tool = toolCall[key] as { args?: Record<string, unknown> } | undefined;
      const args = tool?.args || {};

      if (key.includes('read') && args.path) return `Read ${args.path}`;
      if (key.includes('write') && args.path) return `Write ${args.path}`;
      if (key.includes('grep')) {
        const pattern = args.pattern || 'pattern';
        const path = args.path;
        return path ? `Search ${path} for ${pattern}` : `Search for ${pattern}`;
      }
      if (key.includes('glob') && args.pattern) return `Glob ${args.pattern}`;
      if ((key.includes('bash') || key.includes('shell')) && (args.command || args.cmd)) {
        return `\`${args.command || args.cmd}\``;
      }
      if ((key.includes('bash') || key.includes('shell')) && args.commands && Array.isArray(args.commands)) {
        return `\`${args.commands.join(' && ')}\``;
      }
    }
    return 'other';
  }

  private extractLocations(toolCall: Record<string, unknown>): ToolUpdate['locations'] {
    const keys = Object.keys(toolCall);
    for (const key of keys) {
      const tool = toolCall[key] as { args?: Record<string, unknown> } | undefined;
      const args = tool?.args || {};

      if (args.path) {
        if (typeof args.path === 'string') {
          return [{ path: args.path, line: args.line as number | undefined }];
        }
        if (Array.isArray(args.path)) {
          return args.path.map((p: string | { path: string; line?: number }) =>
            typeof p === 'string' ? { path: p } : { path: p.path, line: p.line }
          );
        }
      }

      if (args.paths && Array.isArray(args.paths)) {
        return args.paths.map((p: string | { path: string; line?: number }) =>
          typeof p === 'string' ? { path: p } : { path: p.path, line: p.line }
        );
      }
    }
    return undefined;
  }

  private extractResult(toolCall: Record<string, unknown>): {
    error?: string;
    content?: ToolUpdate['content'];
    locations?: ToolUpdate['locations'];
    rawOutput?: string;
  } {
    const keys = Object.keys(toolCall);
    for (const key of keys) {
      const tool = toolCall[key] as {
        result?: Record<string, unknown>;
        args?: Record<string, unknown>;
      } | undefined;
      const result = tool?.result || {};

      if (result.error) {
        return { error: result.error as string };
      }

      const locations: ToolUpdate['locations'] = [];
      if (result.matches && Array.isArray(result.matches)) {
        locations.push(...result.matches.map((m: { path: string; line?: number }) => ({
          path: m.path,
          line: m.line
        })));
      }
      if (result.files && Array.isArray(result.files)) {
        locations.push(...result.files.map((f: string) => ({ path: f })));
      }
      if (result.path) {
        locations.push({ path: result.path as string, line: result.line as number | undefined });
      }

      const content: ToolUpdate['content'] = [];

      // Handle write operations with diff generation
      if (key.includes('write')) {
        const oldText = result.oldText ?? null;
        const newText = result.newText as string | undefined;
        const path = (tool?.args?.path as string) || (result.path as string);
        if (newText !== undefined || oldText !== undefined) {
          content.push({
            type: 'diff',
            path,
            oldText,
            newText
          });
        }
      }

      if (result.content) {
        content.push({
          type: 'content',
          content: { text: result.content as string }
        });
      }

      if (result.output !== undefined || result.exitCode !== undefined) {
        content.push({
          type: 'content',
          content: {
            text: `Exit code: ${result.exitCode ?? 0}\n${result.output || '(no output)'}`
          }
        });
      }

      return {
        content: content.length > 0 ? content : undefined,
        locations: locations.length > 0 ? locations : undefined,
        rawOutput: JSON.stringify(result)
      };
    }
    return {};
  }
}
