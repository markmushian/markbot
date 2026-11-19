// The ACP registry lists every agent that speaks the protocol, with how to start it. Fetching it is what turns
// "which engines exist?" from a hardcoded list into whatever is published today: Kimi, Qwen, CodeBuddy, GLM and the
// rest appear without a code change. Only the distributions a person can start with one command are offered here;
// platform binaries need a download and a checksum, which the app does not do on someone's behalf yet.
const REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const CACHE_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 15_000;

export interface RegistryLaunch {
  /** The whole command line, exactly what the custom ACP engine's `cli` field takes. */
  cli: string;
  /** Where it comes from, so the settings page can say "via npm" or "via uv". */
  source: "npx" | "uvx";
}

export interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string | null;
  repository: string | null;
  license: string | null;
  launch: RegistryLaunch | null;
}

interface RawDistribution {
  npx?: { package?: string; args?: string[] };
  uvx?: { package?: string; args?: string[] };
  binary?: Record<string, unknown>;
}

interface RawAgent {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  icon?: string;
  repository?: string;
  license?: string;
  distribution?: RawDistribution;
}

/** `npx -y pkg args` / `uvx pkg args`, or null when this agent ships only platform binaries. */
export function launchFor(distribution: RawDistribution | undefined): RegistryLaunch | null {
  const npx = distribution?.npx;
  if (npx?.package?.trim()) {
    const args = (npx.args ?? []).filter((arg) => typeof arg === "string" && arg.trim());
    return { cli: ["npx", "-y", npx.package.trim(), ...args].join(" "), source: "npx" };
  }
  const uvx = distribution?.uvx;
  if (uvx?.package?.trim()) {
    const args = (uvx.args ?? []).filter((arg) => typeof arg === "string" && arg.trim());
    return { cli: ["uvx", uvx.package.trim(), ...args].join(" "), source: "uvx" };
  }
  return null;
}

export function normalizeRegistry(body: unknown): RegistryAgent[] {
  const agents = (body as { agents?: unknown })?.agents;
  if (!Array.isArray(agents)) return [];
  const out: RegistryAgent[] = [];
  for (const raw of agents as RawAgent[]) {
    const id = raw?.id?.trim();
    const name = raw?.name?.trim();
    if (!id || !name) continue;
    out.push({
      id,
      name,
      version: raw.version?.trim() ?? "",
      description: (raw.description ?? "").trim(),
      icon: raw.icon?.trim() || null,
      repository: raw.repository?.trim() || null,
      license: raw.license?.trim() || null,
      launch: launchFor(raw.distribution),
    });
  }
  return out.sort((left, right) => left.name.localeCompare(right.name));
}

let cache: { at: number; agents: RegistryAgent[] } | null = null;

/** The registry, from memory when it was fetched within the hour. A failed fetch keeps the previous answer rather than
 *  leaving the settings page empty. */
export async function fetchRegistry(now = Date.now()): Promise<RegistryAgent[]> {
  if (cache && now - cache.at < CACHE_MS) return cache.agents;
  try {
    const response = await fetch(REGISTRY_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`registry answered ${response.status}`);
    const agents = normalizeRegistry(await response.json());
    if (agents.length === 0) throw new Error("registry was empty");
    cache = { at: now, agents };
    return agents;
  } catch (cause) {
    if (cache) return cache.agents;
    throw cause;
  }
}

/** Test seam: forget what was fetched, so a fresh call hits the network again. */
export function resetRegistryCache(): void {
  cache = null;
}
