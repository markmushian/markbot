import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Codex's desktop updater installs each build under a fresh hash: `…\Codex\bin\<hash>\codex.exe`.
 * The hash changes on every update, so a saved absolute path dies silently and the engine reports
 * "CLI not found" until someone re-points it by hand. When the configured path is gone but still
 * looks like that layout, follow the update to whichever sibling build is newest.
 */
const CODEX_BIN_LAYOUT = /[\\/]Codex[\\/]bin[\\/][^\\/]+[\\/]codex(?:\.exe)?$/iu;

export function resolveCodexCli(cli: string): string {
  if (!cli || existsSync(cli)) return cli;
  if (!CODEX_BIN_LAYOUT.test(cli)) return cli;
  const binDir = dirname(dirname(cli));
  let entries: string[];
  try {
    entries = readdirSync(binDir);
  } catch {
    return cli;
  }
  const name = process.platform === "win32" ? "codex.exe" : "codex";
  let best: { path: string; at: number } | null = null;
  for (const entry of entries) {
    const candidate = join(binDir, entry, name);
    try {
      const at = statSync(candidate).mtimeMs;
      if (!best || at > best.at) best = { path: candidate, at };
    } catch {
      // Not a build directory (or no binary in it).
    }
  }
  return best?.path ?? cli;
}
