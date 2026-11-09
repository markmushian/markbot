import { useCallback, useEffect, useState } from "react";
import { api, useStore, type InstanceInfo } from "@/state/store";
import { Loader2, RefreshCw } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { InstanceProviderMark } from "./ProviderIcons";
import { usePlanUsage, type PlanProvider, type PlanWindow } from "./PlanUsage";

const POPOVER_WIDTH = 280;

/** The quota API names drivers plainly; the icon set names them the way instances do. */
const DRIVER_KIND: Record<string, string> = {
  claude: "claudeAgent", codex: "codex", grok: "grokAgent",
};

/** The other direction: an instance's driver kind to the plain name the quota API uses. */
function planDriverOf(driverKind: string): string {
  const entry = Object.entries(DRIVER_KIND).find(([, kind]) => kind === driverKind);
  return entry ? entry[0] : driverKind;
}

/** "3小时58分" / "1天20小时" — the same wording the usage card uses, kept short for a popover. */
export function remainingLabel(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at)) return null;
  const minutes = Math.max(0, Math.round((at - now) / 60_000));
  if (minutes <= 0) return null;
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${rest}分`;
  return `${rest}分`;
}

interface UsageSlice {
  turns: number;
  tokens: number;
  input: number;
  output: number;
  cached: number;
}

/** Mirrors server/claude-code-usage.ts: the subscription's own windows plus the tokens this computer really spent. */
interface ClaudeCodeUsageReport {
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
    byInstance: Array<{ id: string; turns: number; tokens: number }>;
  };
}

const EMPTY_WINDOW: PlanWindow = { available: false, remainingPercent: null, usedPercent: null, resetsAt: null };

/** The Claude Code rail slot is a fixed instance, independent of whatever its display name was renamed to. */
function isClaudeCodeRailEntry(instance: Pick<InstanceInfo, "instanceId" | "displayName">): boolean {
  // The ChatGPT plan used to borrow this slot when it was the only Claude-compatible engine.
  // Now that claudeApi exists, relabelling chatgpt only produced a second, identical star.
  return instance.instanceId === "claudeApi" || /claude\s*code/i.test(instance.displayName ?? "");
}

function useClaudeCodeUsage(enabled: boolean) {
  const [report, setReport] = useState<ClaudeCodeUsageReport | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const data = await api<ClaudeCodeUsageReport>(refresh ? "/api/claude-code-usage?refresh=1" : "/api/claude-code-usage");
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (enabled) void load(false);
  }, [enabled, load]);
  return { report, loading, load };
}

function shortNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function PercentBar({ window, now }: { window: PlanWindow; now: number }) {
  const used = window.usedPercent;
  const remaining = window.remainingPercent;
  // Prefer what is left, which is what the person is watching; fall back to used when only that is reported.
  const left = remaining ?? (used == null ? null : 100 - used);
  const width = left == null ? 0 : Math.max(0, Math.min(100, left));
  const low = left != null && left <= 20;
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-control")}>
        <span
          className={cn("block h-full rounded-full transition-[width]", low ? "bg-danger" : "bg-accent")}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className={cn("w-10 shrink-0 text-right text-note tabular-nums", low ? "text-danger" : "text-ink")}>
        {left == null ? "—" : `${Math.round(left)}%`}
      </span>
      <span className="min-w-0 flex-1 truncate text-note text-ink-secondary">
        {remainingLabel(window.resetsAt, now) ?? ""}
      </span>
    </div>
  );
}

function usePopoverDismiss(onClose: () => void) {
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-engine-usage]")) onClose();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
}

function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={t("planUsage.refresh")}
      title={t("planUsage.refresh")}
      className="rounded-md p-1 text-ink-secondary transition-colors hover:bg-control hover:text-ink disabled:opacity-40"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
    </button>
  );
}

function UsagePopover({ provider, title, anchor, now, loading, onRefresh, onClose }: {
  provider: PlanProvider;
  title: string;
  anchor: { left: number; bottom: number };
  now: number;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  usePopoverDismiss(onClose);
  return (
    <div
      data-engine-usage
      role="dialog"
      aria-label={provider.name}
      style={{ left: anchor.left, bottom: anchor.bottom }}
      className="fixed z-40 w-[280px] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-hairline/50 bg-panel shadow-2xl"
    >
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span className="min-w-0 truncate text-ui font-semibold text-ink">{title}</span>
        <RefreshButton loading={loading} onClick={onRefresh} />
      </div>
      {provider.plan && <div className="px-3 pb-1 text-meta text-ink-secondary">{provider.plan}</div>}
      {provider.ok ? (
        <div className="flex flex-col gap-1.5 px-3 pb-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-note text-ink-secondary">{t("planUsage.fiveHour")}</span>
            <PercentBar window={provider.fiveHour} now={now} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-note text-ink-secondary">{t("planUsage.weekly")}</span>
            <PercentBar window={provider.weekly} now={now} />
          </div>
        </div>
      ) : (
        <p className="px-3 pb-3 text-note text-ink-secondary">{provider.error?.trim() || t("planUsage.empty")}</p>
      )}
    </div>
  );
}

/** Claude Code's own numbers, never a relabelled ChatGPT plan's quota. */
function ClaudeUsagePopover({ report, anchor, now, loading, onRefresh, onClose, title = "Claude Code", localOnly = false }: {
  report: ClaudeCodeUsageReport | null;
  anchor: { left: number; bottom: number };
  now: number;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
  title?: string;
  /** A local-ledger engine (WorkBuddy) has no Claude subscription: never show "sign in to Claude". */
  localOnly?: boolean;
}) {
  usePopoverDismiss(onClose);
  const sub = report?.subscription;
  const local = report?.local;
  return (
    <div
      data-engine-usage
      role="dialog"
      aria-label={title}
      style={{ left: anchor.left, bottom: anchor.bottom }}
      className="fixed z-40 w-[280px] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-hairline/50 bg-panel shadow-2xl"
    >
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span className="min-w-0 truncate text-ui font-semibold text-ink">{title}</span>
        <RefreshButton loading={loading} onClick={onRefresh} />
      </div>
      {sub?.plan && <div className="px-3 pb-1 text-meta text-ink-secondary">{sub.plan}</div>}
      {!report ? (
        <p className="px-3 pb-3 text-note text-ink-secondary">{t("planUsage.loading")}</p>
      ) : (
        <>
          {localOnly ? null : sub?.ok ? (
            <div className="flex flex-col gap-1.5 px-3 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-note text-ink-secondary">{t("planUsage.fiveHour")}</span>
                <PercentBar window={sub.fiveHour ?? EMPTY_WINDOW} now={now} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-note text-ink-secondary">{t("planUsage.weekly")}</span>
                <PercentBar window={sub.weekly ?? EMPTY_WINDOW} now={now} />
              </div>
            </div>
          ) : (
            <p className="px-3 pb-2 text-meta leading-relaxed text-ink-secondary">{t("engineUsage.claudeCode.notSignedIn")}</p>
          )}
          <div className="border-t border-hairline/40 px-3 pb-3 pt-2">
            <div className="mb-1.5 text-meta font-semibold text-ink-secondary">{t("engineUsage.claudeCode.local")}</div>
            {!!local?.byInstance?.length && (
              <p className="mb-1.5 text-meta leading-relaxed text-ink-secondary">
                {t("engineUsage.claudeCode.from", { list: local.byInstance.map((entry) => `${entry.id} (${entry.turns})`).join("、") })}
              </p>
            )}
            <p className="mb-1.5 text-meta leading-relaxed text-ink-secondary">{t("engineUsage.claudeCode.localNote")}</p>
            {local?.available ? (
              <div className="flex flex-col gap-1 text-note text-ink">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="shrink-0 text-ink-secondary">{t("planUsage.fiveHour")}</span>
                  <span className="tabular-nums">
                    {t("engineUsage.claudeCode.turns", { count: local.fiveHour.turns })} · {t("engineUsage.claudeCode.tokens", { count: shortNumber(local.fiveHour.tokens) })}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="shrink-0 text-ink-secondary">{t("planUsage.weekly")}</span>
                  <span className="tabular-nums">
                    {t("engineUsage.claudeCode.turns", { count: local.sevenDay.turns })} · {t("engineUsage.claudeCode.tokens", { count: shortNumber(local.sevenDay.tokens) })}
                  </span>
                </div>
                <div className="mt-1 border-t border-hairline/30 pt-1 text-meta leading-relaxed text-ink-secondary">
                  {t("engineUsage.claudeCode.inOut", {
                    input: shortNumber(local.input),
                    output: shortNumber(local.output),
                    cached: shortNumber(local.cached),
                  })}
                </div>
                {local.models.length > 0 && (
                  <div className="truncate text-meta text-ink-secondary" title={local.models.map((model) => model.name).join(", ")}>
                    {t("engineUsage.claudeCode.models")}：{local.models.map((model) => model.name).join("、")}
                  </div>
                )}
                {local.lastAt && (
                  <div className="text-meta text-ink-secondary">
                    {t("engineUsage.claudeCode.last", { when: new Date(local.lastAt).toLocaleString() })}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-note text-ink-secondary">{t("engineUsage.claudeCode.empty")}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Every engine this computer has, each with its quota behind a tap when one is reported. Engines that report no quota
 * still appear — an empty rail would make the feature look missing rather than say "this one has no numbers".
 */
export function EngineUsageRail() {
  const { state } = useStore();
  const { report, loading, now, load } = usePlanUsage();
  const [openKey, setOpenKey] = useState<string | null>(null);
  // The popover is wider than the rail (80px at icon density) and the sidebar clips its children, so an absolutely
  // positioned box would be cut off. Anchor to viewport coordinates instead and clamp inside the window.
  const [anchor, setAnchor] = useState({ left: 0, bottom: 0 });
  const providers = report?.providers ?? [];
  // Identify the Claude Code rail entry by its instance id, not by a ChatGPT label that can be renamed.
  const hasClaudeCode = state.instances.some((instance) => isClaudeCodeRailEntry(instance));
  const claude = useClaudeCodeUsage(hasClaudeCode);

  // In the sidebar's own order, so the rail matches the list a person already reads.
  const engines: Array<{
    key: string;
    name: string;
    claudeCode: boolean;
    localUsage: boolean;
    instance: Pick<InstanceInfo, "driverKind" | "icon" | "displayName">;
    provider?: (typeof providers)[number];
  }> = state.instances
    // chatgpt is the same CLI and account as codex: keeping both doubled every icon.
    .filter((instance) => instance.instanceId !== "chatgpt")
    .filter((instance) => instance.snapshot.state !== "unavailable" || instance.cli)
    .map((instance) => {
      // The Claude Code rail slot must not borrow a ChatGPT account's quota.
      const claudeCode = isClaudeCodeRailEntry(instance);
      // WorkBuddy runs through the Claude-compatible transport, but its numbers are this
      // machine's ledger, not a Claude subscription: show the ledger, never "sign in to Claude".
      const localUsage = instance.instanceId === "workbuddy-codebuddy";
      return {
        key: `i:${instance.instanceId}`,
        name: claudeCode ? "Claude Code" : instance.displayName,
        claudeCode,
        localUsage,
        instance,
        provider: claudeCode || localUsage ? undefined : providers.find((provider) => provider.driver === planDriverOf(instance.driverKind)),
      };
    });
  if (engines.length === 0) return null;

  const open = engines.find((engine) => engine.key === openKey) ?? null;
  return (
    <div data-engine-usage className="relative flex flex-wrap items-center gap-1 px-2 pb-1.5">
      {engines.map((engine) => (
        <button
          key={engine.key}
          type="button"
          onClick={(event) => {
            if (openKey === engine.key) {
              setOpenKey(null);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            setAnchor({
              left: Math.max(8, Math.min(rect.left - 8, window.innerWidth - POPOVER_WIDTH - 8)),
              bottom: window.innerHeight - rect.top + 8,
            });
            setOpenKey(engine.key);
          }}
          aria-pressed={openKey === engine.key}
          title={engine.name}
          className={cn(
            "grid size-7 place-items-center rounded-lg transition-colors",
            openKey === engine.key ? "bg-control text-ink" : "text-ink-secondary hover:bg-control/60 hover:text-ink",
          )}
        >
          {/* The mark resolves by display name, so hand it the name we actually show in the rail. */}
          <InstanceProviderMark instance={{ ...engine.instance, displayName: engine.name }} size={16} />
        </button>
      ))}
      {open && (
        open.claudeCode || open.localUsage
          ? <ClaudeUsagePopover
              title={open.claudeCode ? "Claude Code" : open.name}
              localOnly={!open.claudeCode}
              report={claude.report}
              anchor={anchor}
              now={now}
              loading={claude.loading}
              onRefresh={() => void claude.load(true)}
              onClose={() => setOpenKey(null)}
            />
          : open.provider
            ? <UsagePopover provider={open.provider} title={open.name} anchor={anchor} now={now} loading={loading} onRefresh={() => void load(true)} onClose={() => setOpenKey(null)} />
            : <NoQuotaPopover name={open.name} anchor={anchor} onClose={() => setOpenKey(null)} />
      )}
    </div>
  );
}

/** An engine that reports no subscription numbers (a custom ACP CLI, an API key endpoint). */
function NoQuotaPopover({ name, anchor, onClose }: { name: string; anchor: { left: number; bottom: number }; onClose: () => void }) {
  usePopoverDismiss(onClose);
  return (
    <div
      data-engine-usage
      role="dialog"
      aria-label={name}
      style={{ left: anchor.left, bottom: anchor.bottom }}
      className="fixed z-40 w-[240px] max-w-[calc(100vw-16px)] overflow-hidden rounded-xl border border-hairline/50 bg-panel px-3 py-2.5 shadow-2xl"
    >
      <div className="truncate text-ui font-semibold text-ink">{name}</div>
      <p className="mt-1 text-note leading-relaxed text-ink-secondary">{t("planUsage.noNumbers")}</p>
    </div>
  );
}
