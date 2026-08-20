export class LineBuffer {
  private buffer = "";
  private decoder = new TextDecoder();

  push(chunk: string | Uint8Array): string[] {
    const text = typeof chunk === "string" ? chunk : this.decoder.decode(chunk);
    if (!text) {
      return [];
    }

    this.buffer += text;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    const completed: string[] = [];
    for (const line of lines) {
      const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
      if (!normalized.trim()) {
        continue;
      }
      completed.push(normalized);
    }

    return completed;
  }

  flush(): string[] {
    if (!this.buffer.trim()) {
      this.buffer = "";
      return [];
    }

    const normalized = this.buffer.endsWith("\r")
      ? this.buffer.slice(0, -1)
      : this.buffer;
    this.buffer = "";

    if (!normalized.trim()) {
      return [];
    }

    return [normalized];
  }
}
