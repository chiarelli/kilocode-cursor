/**
 * Build a delta prompt for cursor-agent --resume sessions.
 * When resuming, cursor-agent already holds conversation state — only send
 * the new turn content instead of replaying the full flattened history.
 */

type TextContentPart = { type: "text"; text: string };
type ImageContentPart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextContentPart | ImageContentPart | Record<string, unknown>;

export type ProxyMessage = {
  role: string;
  content?: string | ContentPart[] | unknown;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

/**
 * Extract text from a message content value that may be a plain string or an
 * array of content parts. Non-text parts (images, audio, etc.) are ignored.
 */
export function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === "text" && typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function formatAssistantToolCalls(message: ProxyMessage | undefined): string | null {
  if (message?.role !== "assistant" || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    return null;
  }

  const calls = message.tool_calls.map((tc) => {
    const fn = tc.function || {};
    return `tool_call(id: ${tc.id || "?"}, name: ${fn.name || "?"}, args: ${fn.arguments || "{}"})`;
  });
  return `ASSISTANT: ${calls.join("\n")}`;
}

function buildToolCallNameMap(message: ProxyMessage | undefined): Map<string, string> {
  const names = new Map<string, string>();
  if (!message || !Array.isArray(message.tool_calls)) return names;
  for (const tc of message.tool_calls) {
    const id = tc.id;
    const name = tc.function?.name;
    if (id && name) names.set(id, name);
  }
  return names;
}

function formatToolResult(message: ProxyMessage, toolNames: Map<string, string>): string {
  const callId = message.tool_call_id || "unknown";
  const body = typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "");
  const name = typeof message.name === "string" && message.name ? message.name : toolNames.get(callId);
  return name
    ? `TOOL_RESULT (name: ${name}, call_id: ${callId}): ${body}`
    : `TOOL_RESULT (call_id: ${callId}): ${body}`;
}

/**
 * Returns prompt text for a resumed session. Falls back to null when delta
 * mode cannot be determined safely (caller should use full prompt builder).
 */
export function buildIncrementalPrompt(messages: Array<ProxyMessage>): string | null {
  if (messages.length === 0) return null;

  const last = messages[messages.length - 1];

  // Tool-loop continuation: last messages are tool results
  if (last?.role === "tool") {
    let firstToolIndex = messages.length - 1;
    while (firstToolIndex > 0 && messages[firstToolIndex - 1]?.role === "tool") {
      firstToolIndex--;
    }

    const assistant = messages[firstToolIndex - 1];
    const toolNames = buildToolCallNameMap(assistant);
    const lines: string[] = [];
    const assistantToolCalls = formatAssistantToolCalls(assistant);
    if (assistantToolCalls) {
      lines.push(assistantToolCalls);
    }

    for (let i = firstToolIndex; i < messages.length; i++) {
      const m = messages[i];
      if (m?.role !== "tool") break;
      lines.push(formatToolResult(m, toolNames));
    }
    // Defensive: loop always unshifts at least once, so this is unreachable today.
    if (lines.length === 0) return null;
    lines.push("The above tool calls have been executed. Continue your response based on these results.");
    return lines.join("\n\n");
  }

  // Normal follow-up: latest user message only
  if (last?.role === "user") {
    const text = extractTextContent(last.content);
    if (!text.trim()) return null;
    // Mixed multimodal follow-ups must fall back to the full prompt so image/audio
    // parts are not silently dropped.
    if (Array.isArray(last.content) && last.content.some((part) => part?.type && part.type !== "text")) {
      return null;
    }
    return text.trim();
  }

  return null;
}
