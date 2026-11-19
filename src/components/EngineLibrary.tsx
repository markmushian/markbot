import { useState, type ReactNode } from "react";
import { ArrowUpRight, Check, ChevronDown, RefreshCw } from "lucide-react";
import { api, useStore, type InstanceInfo } from "@/state/store";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { InstanceProviderMark } from "./ProviderIcons";
import { isAgentCliDriver } from "@/lib/built-in-instances";

export function engineReady(instance: InstanceInfo): boolean {
  if (instance.driverKind === "clineAgent") {
    return instance.snapshot.state === "available" && instance.snapshot.authenticated === true;
  }
  return instance.snapshot.state === "available" &&
    (instance.access === "custom" || instance.snapshot.authenticated !== false);
}

const providers: Record<string, string> = {
  // The engine a person installs is Claude Code, so that is what the settings page calls it; the rest keep the
  // vendor's name, which is what their sign-in pages and API keys say.
  claudeAgent: "Claude Code", codex: "OpenAI", grok: "xAI", grokAgent: "xAI",
  kimiAgent: "Moonshot AI", droidAgent: "Factory", cursorAgent: "Cursor",
  antigravityAgent: "Google", opencodeGo: "OpenCode", qwenAgent: "Qwen",
  hermesAgent: "Nous Research", clineAgent: "Cline", copilotAgent: "GitHub", piAgent: "pi.dev", mistral: "Mistral AI", cerebras: "Cerebras", groq: "Groq", meta: "Meta", museCode: "Meta", deepseekAgent: "DeepSeek",
};

export function providerName(instance: InstanceInfo): string {
  return providers[instance.driverKind] ?? instance.driverKind;
}

/** What a card that stands for several accounts says about all of them. */
export interface EngineCardSummary { title: string; subtitle: string; ready: boolean; status: string; action: string }

/** Children stay mounted so closing a card does not abandon an in-progress sign-in or a CLI path draft. */
export function EngineCard({ instance, children, summary, bare = false }: { instance: InstanceInfo; children: ReactNode; summary?: EngineCardSummary; bare?: boolean }) {
  if (bare) return <div data-engine-card={instance.instanceId} className="min-w-0">{children}</div>;
  const ready = summary?.ready ?? engineReady(instance);
  const email = instance.snapshot.authenticated === true ? instance.snapshot.account?.email : undefined;
  const title = summary?.title ?? instance.displayName;
  const subtitle = summary?.subtitle ?? email ?? (instance.access === "custom"
    ? t("engines.library.custom")
    : providerName(instance));
  // Some CLIs return their executable name rather than a version.
  const version = instance.snapshot.version?.match(/\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?/)?.[0];
  return (
    <details data-engine-card={instance.instanceId} className="group/engine min-w-0 rounded-2xl border border-hairline/40 bg-card transition-colors open:col-span-full open:border-hairline/70 hover:border-hairline/70">
      <summary className="cursor-pointer list-none rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-hairline/30 bg-panel">
            <InstanceProviderMark instance={instance} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lead font-semibold tracking-[-0.015em] text-ink" title={title}>{title}</div>
            <div className="mt-1 truncate text-note text-ink-secondary" title={subtitle}>{subtitle}</div>
          </div>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-ink-secondary transition-transform group-open/engine:rotate-180 motion-reduce:transition-none" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-meta font-medium", ready ? "bg-success/10 text-success" : "bg-control text-ink-secondary")}>
            {ready ? <Check size={12} aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />}
            {summary?.status ?? (ready ? t("onboarding.engines.ready") : instance.snapshot.state === "available" && instance.snapshot.authenticated === false
              ? t("model.signInRequired") : t("onboarding.engines.needsSetup"))}
          </span>
          {summary ? (
            <span className={cn("text-meta font-medium", ready ? "text-ink-secondary" : "text-accent-text")}>{summary.action}</span>
          ) : ready ? (
            <span className="text-meta tabular-nums text-ink-secondary">{version ? `v${version}` : t("engines.library.manage")}</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-note font-semibold text-accent-text">
              {isAgentCliDriver(instance.driverKind) && !instance.install
                ? t("engineSetup.agentCli.action")
                : t("engines.library.setup")}<ArrowUpRight size={13} aria-hidden="true" />
            </span>
          )}
        </div>
      </summary>
      <div className="min-w-0 border-t border-hairline/40 p-4">{children}</div>
    </details>
  );
}

export function EngineSections({ instances, renderEngine, isReady = engineReady }: {
  instances: InstanceInfo[];
  renderEngine: (instance: InstanceInfo) => ReactNode;
  isReady?: (instance: InstanceInfo) => boolean;
}) {
  // Flat, instance-keyed siblings: separate section parents would remount a card that moves between groups and drop
  // unsaved input.
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] items-start gap-3">
    {[true, false].flatMap((ready) => {
      const rows = instances.filter((instance) => isReady(instance) === ready);
      if (!rows.length) return [];
      const label = t(ready ? "onboarding.engines.ready" : "onboarding.engines.needsSetup");
      return [
        <div key={`heading-${ready}`} className={cn("col-span-full flex items-center justify-between gap-3 px-4", !ready && instances.some(isReady) && "mt-4")}>
          <h2 className="text-note font-semibold text-ink-secondary">{label}</h2>
          <span className="text-meta tabular-nums text-ink-secondary">{t(rows.length === 1 ? "engines.library.countOne" : "engines.library.count", { count: rows.length })}</span>
        </div>,
        ...rows.map((instance) => <div key={instance.instanceId} className="contents">{renderEngine(instance)}</div>),
      ];
    })}
    {instances.length === 0 && <p className="col-span-full py-4 text-ui text-ink-secondary">{t("engines.none")}</p>}
  </div>;
}

interface ScanRow { instanceId: string; cli: string; label: string; candidates: string[] }

/** One pass over the agent CLIs this app can drive, then connect a found binary in one click. */
export function ScanLocalEngines() {
  const { refreshInstances } = useStore();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ScanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<ReadonlySet<string>>(new Set());

  const scan = async () => {
    setBusy(true); setError(null);
    try {
      const data = await api<{ engines: ScanRow[] }>("/api/engine-scan");
      setRows(data.engines);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  const connect = async (row: ScanRow) => {
    const cli = row.candidates[0];
    if (!cli) return;
    setConnecting(row.instanceId); setError(null);
    try {
      await api(`/api/instances/${encodeURIComponent(row.instanceId)}`, {
        method: "PATCH", body: JSON.stringify({ cli, linkCli: true }),
      });
      await refreshInstances().catch(() => {});
      setConnected((prev) => new Set(prev).add(row.instanceId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setConnecting(null); }
  };

  return (
    <div data-engine-scan className="min-w-0">
      <button type="button" disabled={busy} onClick={() => void scan()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-note font-medium text-ink-secondary hover:bg-control hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
        <RefreshCw size={13} aria-hidden="true" className={cn(busy && "animate-spin")} />
        {busy ? t("engines.scan.scanning") : t("engines.scan.action")}
      </button>
      {error && <p role="alert" className="mt-1 text-note text-danger">{error}</p>}
      {rows && (
        <div className="mt-1.5 flex flex-col gap-1 rounded-xl border border-hairline/40 bg-control/20 p-2">
          {rows.length === 0 && <p className="text-note text-ink-secondary">{t("engines.scan.empty")}</p>}
          {rows.map((row) => {
            const cli = row.candidates[0];
            return (
              <div key={row.instanceId} className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-note text-ink">{row.label}</span>
                {cli ? (
                  <>
                    <span title={cli} className="hidden max-w-[42%] truncate font-mono text-meta text-ink-tertiary sm:inline">{cli}</span>
                    {connected.has(row.instanceId)
                      ? <span className="shrink-0 text-meta text-success">{t("engines.scan.connected")}</span>
                      : <button type="button" disabled={connecting === row.instanceId} onClick={() => void connect(row)}
                          className="shrink-0 rounded-md bg-accent px-2 py-1 text-meta font-semibold text-accent-ink hover:brightness-110 disabled:opacity-50">
                          {connecting === row.instanceId ? t("engines.scan.connecting") : t("engines.scan.connect")}
                        </button>}
                  </>
                ) : <span className="shrink-0 text-meta text-ink-tertiary">{t("engines.scan.missing")}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RefreshEngines() {
  const { refreshInstances } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  return <div>
    <button type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      setError(null);
      setChecked(false);
      try { await refreshInstances({ reportErrors: true }); setChecked(true); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setBusy(false); }
    }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-note font-medium text-ink-secondary hover:bg-control hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
      <RefreshCw size={13} aria-hidden="true" className={cn(busy && "animate-spin")} />
      {busy ? t("common.checking") : t("engines.library.refresh")}
    </button>
    <ScanLocalEngines />
    {error && <p role="alert" className="mt-1 text-note text-danger">{t("engineSetup.checkFailed", { reason: error })}</p>}
    {checked && <p role="status" className="mt-1 text-meta text-ink-secondary">{t("engineSetup.checked")}</p>}
  </div>;
}
