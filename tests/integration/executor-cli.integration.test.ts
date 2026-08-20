import { describe, it, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chmodSync } from "node:fs";
import { CliExecutor } from "../../src/tools/executors/cli.js";

// This test simulates CLI fallback by putting a mock `opencode` on PATH

describe("OpenCodeToolExecutor CLI fallback", () => {
  it("executes tool via CLI mock", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "oc-cli-"));
    const mock = join(tmp, "opencode");
    const script = `#!/usr/bin/env bash
if [[ "$1" == "tool" && "$2" == "run" ]]; then
  shift 3
  # Now $1 should be --json and $2 the payload
  if [[ "$1" == "--json" ]]; then
    echo "{\"status\":\"ok\",\"echo\":$2}"
    exit 0
  fi
fi
exit 1
`;
    writeFileSync(mock, script, { mode: 0o755 });
    chmodSync(mock, 0o755);

    const prevPath = process.env.PATH;
    process.env.PATH = `${tmp}:` + prevPath;

    const exec = new CliExecutor(2000);
    const res = await exec.execute("demo", { foo: "bar" });

    process.env.PATH = prevPath;

    expect(res.status).toBe("success");
    expect(res.output).toContain("foo");
  });
});
