export interface SessionMetrics {
  sessionId: string;
  model: string;
  promptTokens: number;
  toolCalls: number;
  duration: number;
  timestamp: number;
}

export interface AggregateMetrics {
  totalPrompts: number;
  totalToolCalls: number;
  totalDuration: number;
  avgDuration: number;
}

export class MetricsTracker {
  private sessions: Map<string, SessionMetrics> = new Map();

  recordPrompt(sessionId: string, model: string, tokens: number): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.promptTokens = tokens;
      existing.model = model;
    } else {
      this.sessions.set(sessionId, {
        sessionId,
        model,
        promptTokens: tokens,
        toolCalls: 0,
        duration: 0,
        timestamp: Date.now()
      });
    }
  }

  recordToolCall(sessionId: string, toolName: string, duration: number): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.toolCalls++;
      existing.duration += duration;
    }
    // If no session exists, silently ignore (matches test expectations)
  }

  getSessionMetrics(sessionId: string): SessionMetrics | undefined {
    return this.sessions.get(sessionId);
  }

  getAggregateMetrics(hours: number): AggregateMetrics {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    let totalPrompts = 0;
    let totalToolCalls = 0;
    let totalDuration = 0;

    for (const metrics of this.sessions.values()) {
      if (metrics.timestamp >= cutoff) {
        totalPrompts++;
        totalToolCalls += metrics.toolCalls;
        totalDuration += metrics.duration;
      }
    }

    return {
      totalPrompts,
      totalToolCalls,
      totalDuration,
      avgDuration: totalPrompts > 0 ? Math.round(totalDuration / totalPrompts) : 0
    };
  }

  clearMetrics(sessionId?: string): void {
    if (sessionId) {
      this.sessions.delete(sessionId);
    } else {
      this.sessions.clear();
    }
  }

  clearAll(): void {
    this.sessions.clear();
  }
}
