import { describe, expect, it } from "bun:test";
import {
  discoverModelsFromCursorAgent,
  parseCursorModelsOutput,
} from "../../../src/cli/model-discovery.js";

describe("cli/model-discovery", () => {
  it("parses model ids and names from cursor-agent output", () => {
    const output = `
auto - Auto (current) (default)
sonnet-4.5 - Claude 4.5 Sonnet
gpt-5.2 - GPT-5.2
`;

    const models = parseCursorModelsOutput(output);
    expect(models).toEqual([
      { id: "auto", name: "Auto" },
      { id: "sonnet-4.5", name: "Claude 4.5 Sonnet" },
      { id: "gpt-5.2", name: "GPT-5.2" },
    ]);
  });

  it("ignores noise and de-duplicates ids", () => {
    const output = `
\u001b[32mauto - Auto (current)\u001b[0m
Tip: run cursor-agent login
auto - Auto
`;

    const models = parseCursorModelsOutput(output);
    expect(models).toEqual([{ id: "auto", name: "Auto" }]);
  });
});

describe("cli/model-discovery discoverModelsFromCursorAgent", () => {
  it("runs cursor-agent with shell mode on Windows", () => {
    const calls: Array<{ cmd: string; args: string[]; opts: any }> = [];
    const exec = (cmd: string, args: string[], opts: any) => {
      calls.push({ cmd, args, opts });
      return "auto - Auto\n";
    };

    const models = discoverModelsFromCursorAgent({
      platform: "win32",
      execFileSync: exec as any,
      resolveBinary: () => "C:\\cursor-agent\\cursor-agent.cmd",
    });

    expect(models).toEqual([{ id: "auto", name: "Auto" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe("C:\\cursor-agent\\cursor-agent.cmd");
    expect(calls[0].args).toEqual(["models"]);
    expect(calls[0].opts.shell).toBe(true);
  });

  it("does not use shell mode on non-Windows platforms", () => {
    const calls: Array<{ cmd: string; args: string[]; opts: any }> = [];
    const exec = (cmd: string, args: string[], opts: any) => {
      calls.push({ cmd, args, opts });
      return "auto - Auto\n";
    };

    discoverModelsFromCursorAgent({
      platform: "linux",
      execFileSync: exec as any,
      resolveBinary: () => "/usr/local/bin/cursor-agent",
    });

    expect(calls[0].opts.shell).toBe(false);
    expect(calls[0].opts.killSignal).toBe("SIGTERM");
  });
});
