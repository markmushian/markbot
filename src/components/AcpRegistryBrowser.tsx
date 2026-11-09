import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";

import { api, useStore } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

interface RegistryLaunch { cli: string; source: "npx" | "uvx" }
interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string | null;
  repository: string | null;
  license: string | null;
  launch: RegistryLaunch | null;
}

/**
 * The public ACP registry, as a picker. Collapsed until asked: one request per visit, not one per settings page open.
 * A pick becomes a custom ACP engine whose command is the registry's own launch line, so it behaves exactly like an
 * engine someone typed in by hand.
 */
export function AcpRegistryBrowser() {
  const { state, refreshInstances } = useStore();
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<RegistryAgent[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || agents) return;
    let alive = true;
    void api<{ agents: RegistryAgent[] }>("/api/acp-registry")
      .then((result) => { if (alive) setAgents(result.agents); })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; };
  }, [open, agents]);

  // What is already installed, by the command each instance runs: two entries with the same command are the same engine.
  const installed = new Set(state.instances.map((instance) => instance.cli?.trim()).filter(Boolean));
  const addable = (agents ?? []).filter((agent) => agent.launch !== null);
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? addable.filter((agent) => `${agent.name} ${agent.description} ${agent.id}`.toLowerCase().includes(needle))
    : addable;

  const add = async (agent: RegistryAgent) => {
    if (!agent.launch) return;
    setBusy(agent.id);
    setError("");
    setNote("");
    try {
      await api("/api/instances/acp", {
        method: "POST",
        body: JSON.stringify({ id: agent.id, displayName: agent.name, cli: agent.launch.cli }),
      });
      await refreshInstances();
      setNote(t("engines.registry.added", { name: agent.name }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="px-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-hairline/40 bg-card px-4 py-3 text-left transition-colors hover:bg-control/40"
      >
        <span className="min-w-0">
          <span className="block text-body font-medium text-ink">{t("engines.registry.title")}</span>
          <span className="mt-0.5 block truncate text-note text-ink-secondary">
            {agents ? t("engines.registry.count", { count: addable.length }) : t("engines.registry.intro")}
          </span>
        </span>
        <ChevronDown size={16} className={cn("shrink-0 text-ink-secondary transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 overflow-hidden rounded-xl border border-hairline/40">
          <div className="border-b border-hairline/30 p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("engines.registry.search")}
              className="w-full rounded-lg border border-hairline/40 bg-app px-3 py-2 text-ui text-ink placeholder:text-ink-secondary focus:outline-none focus-visible:border-accent"
            />
          </div>
          {!agents && !error && (
            <p role="status" className="flex items-center gap-2 px-4 py-3 text-ui text-ink-secondary">
              <Loader2 size={14} className="animate-spin" />{t("engines.registry.loading")}
            </p>
          )}
          {error && <p role="alert" className="px-4 py-3 text-ui text-danger">{error}</p>}
          {note && <p role="status" className="px-4 py-2 text-note text-ink-secondary">{note}</p>}
          {agents && (
            <ul className="max-h-[420px] overflow-y-auto">
              {shown.map((agent) => {
                const already = agent.launch ? installed.has(agent.launch.cli) : false;
                return (
                  <li key={agent.id} className="flex items-start gap-3 border-b border-hairline/20 px-4 py-3 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-ui font-medium text-ink">{agent.name}</span>
                        <span className="text-meta text-ink-secondary">{agent.version}</span>
                        {agent.launch && <span className="text-meta text-ink-secondary">· {agent.launch.source}</span>}
                      </div>
                      {agent.description && (
                        <p className="mt-1 line-clamp-2 text-note leading-relaxed text-ink-secondary">{agent.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={already || busy !== null}
                      onClick={() => void add(agent)}
                      className={cn(
                        "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-note font-medium transition-colors",
                        already
                          ? "cursor-default bg-control/40 text-ink-secondary"
                          : "bg-accent text-white hover:brightness-110 disabled:opacity-40",
                      )}
                    >
                      {busy === agent.id ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      {already ? t("engines.registry.installed") : t("engines.registry.add")}
                    </button>
                  </li>
                );
              })}
              {!shown.length && <li className="px-4 py-3 text-ui text-ink-secondary">{t("engines.registry.empty")}</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
