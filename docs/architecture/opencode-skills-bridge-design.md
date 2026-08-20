# OpenCode Skills Bridge Design Document

## Executive Summary

Enable bidirectional tool flow between OpenCode and Cursor:
- **Current**: Cursor tools → OpenCode (one direction)
- **Goal**: OpenCode skills/tools ←→ Cursor (bidirectional)

This allows Cursor models to invoke OpenCode's registered skills (like `brainstorm`, `write_plan`, etc.) and MCP tools.

## Architecture Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   OpenCode      │         │  cursor-acp      │         │  Cursor Agent   │
│                 │         │   Plugin         │         │                 │
│ ┌─────────────┐ │         │ ┌──────────────┐ │         │ ┌─────────────┐ │
│ │   Skills    │ │◄───────►│ │ Tool Registry│ │◄───────►│ │  Tool Calls │ │
│ │  Registry   │ │         │ │   + Router   │ │         │ │  (stream)   │ │
│ └─────────────┘ │         │ └──────────────┘ │         │ └─────────────┘ │
│        │        │         │        │         │                │          │
│        ▼        │         │        ▼         │                ▼          │
│ ┌─────────────┐ │         │ ┌──────────────┐ │         ┌────────────────┐│
│ │ Plugin Tool │ │         │ │ HTTP Proxy   │ │         │ Model Response ││
│ │  Execution  │ │◄────────│ │  (32124)     │ │         │  with Results  ││
│ └─────────────┘ │         │ └──────────────┘ │         └────────────────┘│
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Research Findings

### OpenCode Tool System

**Plugin Interface** (`@opencode-ai/plugin`):
```typescript
export type PluginInput = {
  client: OpencodeClient;
  project: Project;
  serverUrl: string;
  $: BunShell;
  // ... hooks
};

export type PluginOutput = {
  tool?: { [key: string]: ToolDefinition };  // Tools this plugin registers
  chat?: {
    params?: (options: { messages: Message[] }) => { messages: Message[] } | void;
  };
};

export type ToolDefinition = {
  description: string;
  args: z.ZodRawShape;
  execute: (args: any, context: ToolContext) => Promise<string>;
};
```

**SDK Tool API** (`@opencode-ai/sdk`):
```typescript
class OpencodeClient {
  tool: {
    ids(): Promise<ToolIdsResponse>;     // List all tool IDs
    list(): Promise<ToolListResponse>;   // List with JSON schemas
  };
  session: {
    create(): Promise<Session>;
    // Note: No direct tool.invoke() method
  };
}
```

**UserMessage Type**:
```typescript
export type UserMessage = {
  role: "user";
  content: MessageContent[];
  tools?: { [key: string]: boolean };  // Enabled tools for this message
};
```

### Key Challenge

**No Direct Tool Invocation API**: The OpenCode SDK doesn't expose a method to programmatically invoke tools from providers. Tool execution is handled internally by OpenCode when models return tool calls.

## Proposed Design

### Phase 1: Tool Discovery & Exposure

**Step 1: Tool Discovery Module**

Create `src/tools/opencode-discovery.ts`:

```typescript
export interface OpenCodeTool {
  id: string;
  name: string;
  description: string;
  parameters: JSONSchema;
}

export class OpenCodeToolDiscovery {
  private client: OpencodeClient;
  private cache: Map<string, OpenCodeTool> = new Map();
  private cacheExpiry: number = 0;

  constructor(client: OpencodeClient) {
    this.client = client;
  }

  async discoverTools(): Promise<OpenCodeTool[]> {
    // Check cache
    if (Date.now() < this.cacheExpiry && this.cache.size > 0) {
      return Array.from(this.cache.values());
    }

    // Fetch from OpenCode
    const response = await this.client.tool.list();
    const tools: OpenCodeTool[] = response.data?.tools?.map((t: any) => ({
      id: t.id,
      name: t.name || t.id,
      description: t.description,
      parameters: t.parameters || { type: "object", properties: {} }
    })) || [];

    // Update cache
    this.cache.clear();
    tools.forEach(t => this.cache.set(t.id, t));
    this.cacheExpiry = Date.now() + 60000; // 1 minute cache

    return tools;
  }

  getTool(id: string): OpenCodeTool | undefined {
    return this.cache.get(id);
  }
}
```

**Step 2: Tool Router (Bidirectional)**

Create `src/tools/opencode-router.ts`:

```typescript
export interface ToolInvocation {
  toolId: string;
  callId: string;
  args: Record<string, any>;
  sessionId: string;
}

export interface ToolResult {
  callId: string;
  status: "success" | "error";
  output?: string;
  error?: string;
}

/**
 * Routes tool calls between OpenCode and Cursor
 * 
 * Since OpenCode doesn't expose a direct tool.invoke() API,
 * we use an HTTP callback mechanism:
 * 1. Plugin exposes HTTP endpoint for tool execution
 * 2. Provider calls this endpoint when cursor-agent invokes tools
 * 3. Plugin executes tool via OpenCode's internal mechanism
 */
export class OpenCodeToolRouter {
  private discovery: OpenCodeToolDiscovery;
  private pluginPort: number;
  private pendingInvocations: Map<string, ToolInvocation> = new Map();

  constructor(discovery: OpenCodeToolDiscovery, pluginPort: number) {
    this.discovery = discovery;
    this.pluginPort = pluginPort;
  }

  /**
   * Convert OpenCode tools to OpenAI function calling format
   */
  async toOpenAiTools(): Promise<OpenAiTool[]> {
    const tools = await this.discovery.discoverTools();
    return tools.map(t => ({
      type: "function" as const,
      function: {
        name: this.sanitizeToolName(t.name),
        description: t.description,
        parameters: t.parameters
      }
    }));
  }

  /**
   * Sanitize tool name for OpenAI (alphanumeric, underscores, max 64 chars)
   */
  private sanitizeToolName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64);
  }

  /**
   * Execute a tool invocation by calling back to OpenCode plugin
   */
  async executeTool(invocation: ToolInvocation): Promise<ToolResult> {
    // Call the plugin's tool execution endpoint
    const response = await fetch(`http://127.0.0.1:${this.pluginPort}/.opencode/tool-execution`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invocation)
    });

    if (!response.ok) {
      return {
        callId: invocation.callId,
        status: "error",
        error: `Tool execution failed: ${response.statusText}`
      };
    }

    return await response.json();
  }
}
```

### Phase 2: Plugin Integration

**Update `src/plugin.ts`**:

```typescript
import { OpenCodeToolDiscovery } from "./tools/opencode-discovery";
import { OpenCodeToolRouter } from "./tools/opencode-router";

export default definePlugin((input: PluginInput) => {
  const { client, serverUrl, $ } = input;
  
  // Initialize tool discovery
  const toolDiscovery = new OpenCodeToolDiscovery(client);
  const toolRouter = new OpenCodeToolRouter(toolDiscovery, 32125); // Plugin port
  
  // Start tool execution endpoint
  const toolServer = Bun.serve({
    port: 32125,
    async fetch(req) {
      const url = new URL(req.url);
      
      if (url.pathname === "/.opencode/tool-execution" && req.method === "POST") {
        const invocation: ToolInvocation = await req.json();
        
        // Execute tool via OpenCode
        // Note: This requires OpenCode to expose tool execution to plugins
        // Currently not available, would need OpenCode SDK update
        const result = await executeViaOpenCode(invocation);
        
        return Response.json(result);
      }
      
      return new Response("Not Found", { status: 404 });
    }
  });

  return {
    name: "cursor-acp",
    description: "Cursor Agent Compatibility Proxy with bidirectional tools",
    
    chat: {
      params: async ({ messages }) => {
        // Get OpenCode tools and inject into request
        const openCodeTools = await toolRouter.toOpenAiTools();
        
        // Store tools for later use in proxy
        process.env.CURSOR_ACP_OPENCODE_TOOLS = JSON.stringify(openCodeTools);
        
        return { messages };
      }
    },
    
    async onClose() {
      toolServer.stop();
    }
  };
});
```

### Phase 3: Provider Integration

**Update `src/provider.ts`**:

```typescript
import { OpenCodeToolRouter } from "./tools/opencode-router";

// In direct mode streaming
async function handleStreamingWithTools(
  prompt: string,
  model: string,
  options: ProviderOptions
) {
  // Get OpenCode tools from environment or options
  const openCodeTools = JSON.parse(
    process.env.CURSOR_ACP_OPENCODE_TOOLS || "[]"
  );
  
  // Start cursor-agent with tools
  const stream = client.executePromptStream(prompt, {
    model,
    tools: openCodeTools, // Pass to cursor-agent
    ...options
  });
  
  // Handle tool calls from cursor-agent
  for await (const event of stream) {
    if (event.type === "tool_call") {
      // Check if this is an OpenCode tool (not a Cursor native tool)
      const toolName = inferToolName(event);
      if (isOpenCodeTool(toolName)) {
        // Route to OpenCode for execution
        const result = await toolRouter.executeTool({
          toolId: toolName,
          callId: event.call_id || "",
          args: extractToolArgs(event),
          sessionId: options.sessionId || ""
        });
        
        // Stream result back to cursor-agent
        yield createToolResultEvent(result);
      }
    }
    
    yield event;
  }
}
```

### Phase 4: Configuration

**Environment Variables**:
```bash
# Enable bidirectional tool flow
CURSOR_ACP_ENABLE_OPENCODE_TOOLS=true

# Plugin port for tool execution callback
CURSOR_ACP_PLUGIN_PORT=32125

# Cache TTL for tool discovery (ms)
CURSOR_ACP_TOOL_CACHE_TTL=60000
```

## Implementation Challenges & Solutions

### Challenge 1: No Direct Tool.invoke() API

**Problem**: OpenCode SDK doesn't expose `client.tool.invoke(toolId, args)`.

**Solution**: Use HTTP callback pattern:
1. Plugin exposes `/tool-execution` endpoint
2. Provider calls this endpoint when cursor-agent invokes tools
3. Plugin uses internal OpenCode mechanism to execute

**Requires**: OpenCode SDK update or internal API exposure.

### Challenge 2: Tool Name Conflicts

**Problem**: OpenCode tools might have same names as Cursor native tools.

**Solution**: Namespace OpenCode tools:
```typescript
// Prefix with opencode_ to avoid conflicts
function sanitizeToolName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 59);
  return `opencode_${sanitized}`;
}
```

### Challenge 3: Schema Compatibility

**Problem**: OpenCode uses JSON Schema, OpenAI uses similar but may have differences.

**Solution**: Schema transformation layer in `OpenCodeToolRouter`.

### Challenge 4: Streaming Tool Results

**Problem**: Tool execution might take time, need to stream progress.

**Solution**: Use SSE for tool execution status updates:
```typescript
// In proxy handler
if (toolCall.isOpenCodeTool) {
  yield `event: tool_start\ndata: ${JSON.stringify({ toolId, callId })}\n\n`;
  
  const result = await executeTool(toolCall);
  
  yield `event: tool_result\ndata: ${JSON.stringify(result)}\n\n`;
}
```

## Alternative Approaches

### Alternative 1: MCP Bridge

Instead of custom HTTP endpoint, use MCP (Model Context Protocol):
- Expose OpenCode tools as MCP server
- Cursor-agent connects to MCP server
- More standardized but requires MCP support in cursor-agent

**Pros**: Standard protocol, ecosystem compatibility  
**Cons**: Requires cursor-agent MCP support, more complex

### Alternative 2: File-based Communication

Use files for provider-plugin communication:
1. Provider writes tool calls to `/tmp/opencode-tool-calls.jsonl`
2. Plugin polls and executes
3. Results written to `/tmp/opencode-tool-results.jsonl`
4. Provider polls for results

**Pros**: Simple, no network dependencies  
**Cons**: Latency, file locking issues

### Alternative 3: Two-phase Conversation

Don't try to execute tools in real-time:
1. First request: Get tool calls from cursor-agent
2. Pause conversation
3. Execute tools via normal OpenCode flow
4. Second request: Send results back to cursor-agent

**Pros**: Uses existing OpenCode mechanisms  
**Cons**: Breaks streaming, complex UX

## Recommended Approach

**Phase 1 (MVP)**: HTTP Callback with Plugin Endpoint
- Implement tool discovery via `client.tool.list()`
- Expose tools to cursor-agent
- Use HTTP callback for tool execution
- Requires OpenCode SDK update for tool.invoke()

**Phase 2 (Future)**: MCP Integration
- If cursor-agent adds MCP support
- Migrate to standardized MCP protocol
- Better ecosystem compatibility

## Files to Create/Modify

### New Files
- `src/tools/opencode-discovery.ts` - Tool discovery from OpenCode
- `src/tools/opencode-router.ts` - Bidirectional routing
- `src/tools/opencode-executor.ts` - Tool execution wrapper
- `tests/unit/opencode-tools.test.ts` - Unit tests

### Modified Files
- `src/plugin.ts` - Add tool discovery and HTTP endpoint
- `src/provider.ts` - Handle tool calls and routing
- `src/proxy/handler.ts` - Inject tools into requests
- `src/index.ts` - Export new types

## Testing Strategy

1. **Unit Tests**:
   - Tool discovery caching
   - Schema transformation
   - Name sanitization

2. **Integration Tests**:
   - Full flow: OpenCode tool → cursor-agent → execution → result

3. **E2E Tests**:
   - Real conversation using OpenCode skills via Cursor

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenCode SDK doesn't support tool.invoke() | High | Requires SDK update or alternative approach |
| Performance overhead of HTTP callbacks | Medium | Implement caching, connection pooling |
| Tool name conflicts | Low | Namespace with prefix |
| Schema incompatibility | Medium | Transform layer with validation |
| Security of tool execution endpoint | High | Localhost only, auth tokens |

## Success Criteria

1. ✅ OpenCode tools appear in Cursor model's tool list
2. ✅ Cursor model can call OpenCode tools
3. ✅ Tool results stream back correctly
4. ✅ Native Cursor tools still work
5. ✅ Performance overhead < 100ms per tool call

## Next Steps

1. **Investigate OpenCode SDK**: Confirm if `tool.invoke()` can be added
2. **Prototype**: Build minimal version with hardcoded tool
3. **Test**: Validate with brainstorm/writing_plan skills
4. **Iterate**: Add caching, error handling, streaming
5. **Document**: Update README with bidirectional tool usage

## Appendix: Example Flow

**User Prompt**:
```
I want to build a Pong game in Go.
Use the brainstorm skill to generate design ideas.
```

**Execution Flow**:
1. OpenCode loads cursor-acp provider
2. Provider discovers `brainstorm` tool from OpenCode
3. Converts to OpenAI format: `opencode_brainstorm`
4. Sends to cursor-agent with tools list
5. Cursor model calls `opencode_brainstorm({ topic: "Pong game in Go" })`
6. cursor-agent streams tool call event
7. cursor-acp intercepts, routes to OpenCode via HTTP callback
8. OpenCode executes `brainstorm` skill
9. Result streams back through cursor-acp
10. Cursor model receives result, continues conversation

**Expected Output**:
```
Assistant: I'll help you design a Pong game. Let me brainstorm some ideas.

[Tool Call: brainstorm]
Design ideas for Pong game:
1. Classic 2D with simple physics
2. Power-ups (speed boost, paddle expansion)
3. AI opponent with difficulty levels
4. Sound effects and particle effects

Now let me create a plan...
```
