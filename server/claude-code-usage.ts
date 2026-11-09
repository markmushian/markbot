// Real Claude Code usage for the engine rail. Subscription windows come from Anthropic's own usage endpoint when
// Claude Code is signed in here; token counts come from this app's usage ledger and Claude Code's session transcripts.
// Nothing is invented: a source that is not available says so instead of showing another account's numbers.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { InstanceConfigMap } from "./contracts.ts";
import { resolveClaudeConfigDir } from "./drivers/claude.ts";
import { loadPlanUsage, planAccountsFromInstances, type PlanAccount, type PlanWindow } from "./plan-usage.ts";
import { readUsage, type UsageRow } from "./usage-ledger.ts";

const CACHE_MS = 45_000;
const FIVE_HOUR_MS = 5 * 3_600_000;
const SEVEN_DAY_MS = 7 * 86_400_000;
const MAX_SESSION_FILES = 2_000;
const MAX_SESSION_BYTES = 24 * 1024 * 1024;

export interface UsageSlice {
  turns: number;
  tokens: number;
  input: number;
  output: number;
  cached: number;
}

export interface ClaudeCodeUsageReport {
  fetchedAt: string;
  subscription: {
    ok: boolean;
    plan: string | null;
    fiveHour: PlanWindow | null;
    weekly: PlanWindow | null;
    error: string | null;
  };
  local: UsageSlice & {
    available: boolean;
    fiveHour: UsageSlice;
    sevenDay: UsageSlice;
    models: Array<{ name: string; turns: number; tokens: number }>;
    lastAt: string | null;
    sources: string[];
    configDir: string | null;
    /** Which real instance booked these tokens. A Claude-compatible driver is not the Claude subscription. */
    byInstance: Array<{ id: string; turns: number; tokens: number }>;
  };
}

interface Sample {
  at: number;
  input: number;
  output: number;
  cached: number;
  model: string;
  instanceId: string | null;
}

/** The default credential home: `claude auth login` in a terminal, or the built-in Claude Code account. */
const CLAUDE_CODE_ACCOUNT: PlanAccount = {
  id: "claude-code",
  name: "Claude Code",
  driver: "claude",
  environment: {},
};

/**
 * Every credential home Claude Code could be signed into. Accounts added from Settings each get their own
 * `configDir` (`~/.markbot-oss/providers/<id>`), so reading only `~/.claude` would miss their subscription
 * windows. The default home always comes first; duplicate directories are fetched once.
 */
function claudeAccounts(instances?: InstanceConfigMap): PlanAccount[] {
  const accounts: PlanAccount[] = [CLAUDE_CODE_ACCOUNT];
  const seen = new Set<string>([""]);
  for (const account of planAccountsFromInstances(instances ?? {})) {
    if (account.driver !== "claude") continue;
    const key = account.configDir ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push(account);
  }
  return accounts;
}

/** Exported for verification: the resolved directories whose transcripts and credentials are read. */
export function claudeCodeAccountDirs(instances?: InstanceConfigMap, env: NodeJS.ProcessEnv = process.env): string[] {
  const dirs: string[] = [];
  for (const account of claudeAccounts(instances)) {
    try {
      const dir = resolveClaudeConfigDir(account.configDir, { ...env, ...account.environment });
      if (!dirs.includes(dir)) dirs.push(dir);
    } catch { /* A malformed saved directory must not hide the working accounts. */ }
  }
  return dirs;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

function stamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The app books Claude-compatible engines this way, including WorkBuddy's Claude ACP compatibility. */
function isClaudeRow(row: UsageRow): boolean {
  return row.driverKind === "claudeAgent"
    || /claude/i.test(row.driverKind)
    || /claude/i.test(row.instanceId)
    || /^claude[-_/]/i.test(row.model);
}

function ledgerSamples(dataDir: string, now: number): Sample[] {
  let rows: UsageRow[];
  try {
    rows = readUsage(dataDir, { from: new Date(now - SEVEN_DAY_MS), to: new Date(now + 60_000) });
  } catch {
    return [];
  }
  const samples: Sample[] = [];
  for (const row of rows) {
    if (!isClaudeRow(row)) continue;
    const at = stamp(row.at);
    if (at === null || at > now + 60_000) continue;
    samples.push({
      at,
      input: count(row.input),
      output: count(row.output),
      cached: count(row.cachedInput) + count(row.cacheWrite),
      model: row.model || "unknown",
      instanceId: row.instanceId || "unknown",
    });
  }
  return samples;
}

async function jsonlFiles(root: string, depth: number, found: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (found.length >= MAX_SESSION_FILES) return;
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (depth < 3) await jsonlFiles(full, depth + 1, found);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      found.push(full);
    }
  }
}

/** Claude Code writes one JSONL line per message; assistant lines carry the model's own token usage. */
async function sessionSamples(configDir: string): Promise<Sample[]> {
  const files: string[] = [];
  await jsonlFiles(join(configDir, "projects"), 0, files);
  const samples: Sample[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    let text: string;
    try {
      const info = await stat(file);
      if (info.size > MAX_SESSION_BYTES) continue;
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let row: unknown;
      try {
        row = JSON.parse(line) as unknown;
      } catch {
        continue;
      }
      const entry = asRecord(row);
      if (!entry || entry.type !== "assistant") continue;
      const message = asRecord(entry.message);
      const usage = asRecord(message?.usage);
      if (!usage) continue;
      // Streamed writes repeat the same assistant message; count it once.
      const key = `${String(message?.id ?? "")}|${String(entry.requestId ?? "")}|${String(usage.output_tokens ?? "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const at = stamp(entry.timestamp);
      if (at === null) continue;
      samples.push({
        at,
        input: count(usage.input_tokens),
        output: count(usage.output_tokens),
        cached: count(usage.cache_read_input_tokens) + count(usage.cache_creation_input_tokens),
        model: typeof message?.model === "string" ? message.model : "claude",
        instanceId: "claude-code-sessions",
      });
    }
  }
  return samples;
}

function slice(rows: Sample[]): UsageSlice {
  let input = 0;
  let output = 0;
  let cached = 0;
  for (const row of rows) {
    input += row.input;
    output += row.output;
    cached += row.cached;
  }
  return { turns: rows.length, tokens: input + output, input, output, cached };
}

function aggregate(samples: Sample[], now: number, sources: string[], configDir: string | null): ClaudeCodeUsageReport["local"] {
  const seven = samples.filter((row) => row.at >= now - SEVEN_DAY_MS && row.at <= now + 60_000);
  const models = new Map<string, { turns: number; tokens: number }>();
  const instances = new Map<string, { turns: number; tokens: number }>();
  for (const row of seven) {
    const entry = models.get(row.model) ?? { turns: 0, tokens: 0 };
    entry.turns += 1;
    entry.tokens += row.input + row.output;
    models.set(row.model, entry);
    const owner = row.instanceId ?? "unknown";
    const booked = instances.get(owner) ?? { turns: 0, tokens: 0 };
    booked.turns += 1;
    booked.tokens += row.input + row.output;
    instances.set(owner, booked);
  }
  let lastAt: string | null = null;
  for (const row of seven) {
    const iso = new Date(row.at).toISOString();
    if (lastAt === null || iso > lastAt) lastAt = iso;
  }
  return {
    ...slice(seven),
    available: seven.length > 0,
    fiveHour: slice(seven.filter((row) => row.at >= now - FIVE_HOUR_MS)),
    sevenDay: slice(seven),
    models: [...models.entries()]
      .map(([name, value]) => ({ name, turns: value.turns, tokens: value.tokens }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 4),
    lastAt,
    sources,
    configDir,
    byInstance: [...instances.entries()]
      .map(([id, value]) => ({ id, turns: value.turns, tokens: value.tokens }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 4),
  };
}

let cached: { at: number; report: ClaudeCodeUsageReport } | null = null;

export function clearClaudeCodeUsageCache(): void {
  cached = null;
}

export async function loadClaudeCodeUsage(input: {
  dataDir: string;
  instances?: InstanceConfigMap;
  refresh?: boolean;
  now?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<ClaudeCodeUsageReport> {
  const now = input.now ?? Date.now();
  if (!input.refresh && cached && now - cached.at < CACHE_MS) return cached.report;
  const env = input.env ?? process.env;
  const accounts = claudeAccounts(input.instances);
  const dirs = claudeCodeAccountDirs(input.instances, env);

  const [plan, groups] = await Promise.all([
    loadPlanUsage({ accounts, refresh: input.refresh, now, env }),
    Promise.all(dirs.map((dir) => sessionSamples(dir))),
  ]);
  const transcripts = groups.flat();
  // Any signed-in Claude account is a real subscription; prefer its windows over an unsigned-in home's error.
  const row = plan.providers.find((provider) => provider.ok) ?? plan.providers[0];
  const samples = [...ledgerSamples(input.dataDir, now), ...transcripts];
  const sources = transcripts.length > 0 ? ["ledger", "claude-code-sessions"] : ["ledger"];
  const report: ClaudeCodeUsageReport = {
    fetchedAt: new Date(now).toISOString(),
    subscription: {
      ok: Boolean(row && row.ok),
      plan: row?.plan ?? null,
      fiveHour: row && row.ok ? row.fiveHour : null,
      weekly: row && row.ok ? row.weekly : null,
      error: row && row.ok ? null : row?.error ?? "Claude Code is not signed in on this computer.",
    },
    local: aggregate(samples, now, sources, dirs[0] ?? null),
  };
  cached = { at: now, report };
  return report;
}
