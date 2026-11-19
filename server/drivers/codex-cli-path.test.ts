import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveCodexCli } from "./codex-cli-path.ts";

const roots: string[] = [];
const binName = process.platform === "win32" ? "codex.exe" : "codex";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "codex-cli-"));
  roots.push(root);
  return root;
}

function build(binDir: string, hash: string, at: Date): string {
  const dir = join(binDir, hash);
  mkdirSync(dir, { recursive: true });
  const binary = join(dir, binName);
  writeFileSync(binary, "");
  utimesSync(binary, at, at);
  return binary;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("resolveCodexCli", () => {
  it("keeps a configured path that still exists", () => {
    const binDir = join(fixture(), "Codex", "bin");
    const live = build(binDir, "current", new Date(2026, 10, 1));
    expect(resolveCodexCli(live)).toBe(live);
  });

  it("follows an update to the newest sibling build under the same bin directory", () => {
    const binDir = join(fixture(), "Codex", "bin");
    build(binDir, "old", new Date(2026, 9, 1));
    const newest = build(binDir, "new", new Date(2026, 10, 5));
    const stale = join(binDir, "gone", binName);
    expect(resolveCodexCli(stale)).toBe(newest);
  });

  it("leaves an unrelated missing path alone so the real error still surfaces", () => {
    const missing = join(fixture(), "elsewhere", "codex");
    expect(resolveCodexCli(missing)).toBe(missing);
  });

  it("returns the configured path when the bin directory holds no build", () => {
    const binDir = join(fixture(), "Codex", "bin");
    mkdirSync(join(binDir, "empty"), { recursive: true });
    const stale = join(binDir, "gone", binName);
    expect(resolveCodexCli(stale)).toBe(stale);
  });
});
