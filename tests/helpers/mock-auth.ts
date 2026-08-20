import { spawn } from "child_process";
import { EventEmitter } from "events";

export interface MockCursorAgentOptions {
  delayMs?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  url?: string;
}

export class MockCursorAgent extends EventEmitter {
  private stdout = "";
  private stderr = "";
  private exited = false;

  constructor(private options: MockCursorAgentOptions = {}) {
    super();
    this.options = {
      delayMs: 100,
      exitCode: 0,
      ...options,
    };
  }

  simulateLogin(): void {
    const { delayMs = 100, exitCode = 0, url } = this.options;

    setTimeout(() => {
      if (url) {
        this.stdout = `Visit this URL to authenticate:\n${url}\n`;
        this.emit("data", Buffer.from(this.stdout));
      }

      setTimeout(() => {
        this.exited = true;
        this.emit("close", exitCode);
      }, delayMs);
    }, 50);
  }

  getStdout(): string {
    return this.stdout;
  }

  getStderr(): string {
    return this.stderr;
  }

  hasExited(): boolean {
    return this.exited;
  }
}

export function createMockCursorAgentSpawn(options: MockCursorAgentOptions = {}) {
  return (
    command: string,
    args: string[],
    options_: any
  ): MockCursorAgent & { stdout: EventEmitter; stderr: EventEmitter } => {
    if (command !== "cursor-agent" || !args.includes("login")) {
      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    }

    const mock = new MockCursorAgent(options);
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();

    mock.on("data", (data) => stdoutEmitter.emit("data", data));
    mock.on("close", (code) => mock.emit("close", code));

    setTimeout(() => mock.simulateLogin(), 10);

    return Object.assign(mock, {
      stdout: stdoutEmitter,
      stderr: stderrEmitter,
    });
  };
}

export function withMockCursorAgent(
  options: MockCursorAgentOptions,
  testFn: () => Promise<void>
): Promise<void> {
  const originalSpawn = require("child_process").spawn;
  
  beforeEach(() => {
    require("child_process").spawn = createMockCursorAgentSpawn(options);
  });

  afterEach(() => {
    require("child_process").spawn = originalSpawn;
  });

  return testFn();
}
