import { useState } from "react";
import { ArrowUpRight, Check, ChevronRight, CircleAlert, KeyRound, RefreshCw, TerminalSquare } from "lucide-react";
import { api, type InstanceInfo, useStore } from "@/state/store";
import { cn } from "@/lib/cn";
import { orderByProviderState, providerStatus, type ProviderAction, type ProviderState } from "@/lib/provider-status";
import { InstanceProviderMark } from "./ProviderIcons";

const STATE_STYLE: Record<ProviderState, string> = {
  ready: "bg-success/10 text-success",
  "needs-sign-in": "bg-warning/10 text-warning",
  "desktop-sign-in": "bg-warning/10 text-warning",
  "not-installed": "bg-control text-ink-secondary",
};

const ACTION_LABEL: Record<ProviderAction, string> = {
  install: "安装",
  "sign-in": "登录",
  "check-updates": "检查更新",
  manage: "管理",
};

/** Expand the real setup card instead of maintaining a second setup flow. */
function revealEngineCard(instanceId: string) {
  const card = document.querySelector<HTMLElement>(`[data-engine-card="${CSS.escape(instanceId)}"]`);
  if (!card) return;
  if (card instanceof HTMLDetailsElement) card.open = true;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.animate?.([{ boxShadow: "0 0 0 0 transparent" }, { boxShadow: "0 0 0 3px var(--accent, #6366f1)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 1200 });
}

export function ProviderStatusCard({ instance }: { instance: InstanceInfo }) {
  const { refreshInstances } = useStore();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const status = providerStatus(instance);

  const runAction = async (action: ProviderAction) => {
    if (action === "check-updates") {
      setChecking(true); setChecked(null);
      try {
        await refreshInstances({ reportErrors: true });
        setChecked("已重新探测");
      } catch (cause) {
        setChecked(cause instanceof Error ? cause.message : "检查失败");
      } finally {
        setChecking(false);
        window.setTimeout(() => setChecked(null), 4000);
      }
      return;
    }
    revealEngineCard(instance.instanceId);
  };

  return (
    <div data-provider-status={instance.instanceId} data-provider-state={status.state}
      className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-hairline/40 bg-card p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-hairline/30 bg-panel">
          <InstanceProviderMark instance={instance} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-ui font-semibold text-ink" title={instance.displayName}>{instance.displayName}</div>
          <div className="truncate text-meta text-ink-tertiary">{instance.driverKind}</div>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-meta font-medium", STATE_STYLE[status.state])}>
          {status.state === "ready" ? <Check size={11} aria-hidden="true" /> : <CircleAlert size={11} aria-hidden="true" />}
          {status.label}
        </span>
      </div>

      <p className="min-w-0 text-meta leading-relaxed text-ink-secondary">{status.reason}</p>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-tertiary">
        {status.version && <span className="tabular-nums">版本 v{status.version}</span>}
        {status.cliPath && (
          <span className="flex min-w-0 max-w-full items-center gap-1" title={status.cliPath}>
            <TerminalSquare size={11} aria-hidden="true" className="shrink-0" />
            <code className="truncate font-mono">{status.cliPath}</code>
          </span>
        )}
        {status.updateAvailable && <span className="font-medium text-warning">有可用更新</span>}
        <span className={cn(!status.usage.known && "italic")}>{status.usage.text}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {status.actions.map((action) => (
          <button key={action} type="button" disabled={checking && action === "check-updates"}
            onClick={() => void runAction(action)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-meta font-medium transition-colors disabled:opacity-50",
              action === "install" || action === "sign-in"
                ? "bg-accent text-accent-ink hover:brightness-110"
                : "bg-control text-ink-secondary hover:bg-raised hover:text-ink",
            )}>
            {action === "check-updates" ? <RefreshCw size={11} aria-hidden="true" className={cn(checking && "animate-spin")} />
              : action === "sign-in" ? <KeyRound size={11} aria-hidden="true" />
                : action === "install" ? <ArrowUpRight size={11} aria-hidden="true" />
                  : <ChevronRight size={11} aria-hidden="true" />}
            {ACTION_LABEL[action]}
          </button>
        ))}
        {checked && <span role="status" className="truncate text-meta text-ink-secondary">{checked}</span>}
      </div>
    </div>
  );
}

/** A permanent status board, not a dialog: the whole point is that you can see
 * "installed but not signed in" without opening anything. */
export function ProviderStatusOverview({ instances }: { instances: readonly InstanceInfo[] }) {
  const { refreshInstances } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cliInstances = instances.filter((instance) => instance.cli !== undefined || instance.cliDefault !== undefined || instance.snapshot.state === "unavailable");
  const rows = orderByProviderState(cliInstances);
  const broken = rows.filter((instance) => providerStatus(instance).state !== "ready").length;

  const checkAll = async () => {
    setBusy(true); setError(null);
    try { await api("/api/engine-scan"); await refreshInstances({ reportErrors: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "检查失败"); }
    finally { setBusy(false); }
  };

  if (!rows.length) return null;
  return (
    <section data-provider-status-overview className="min-w-0 px-4">
      <div className="mb-2.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-ui font-semibold text-ink">引擎状态</h2>
          <p className="mt-0.5 text-meta leading-relaxed text-ink-secondary">
            {broken ? `${broken} 个引擎需要处理；桌面应用登录不会自动同步给命令行。` : "全部就绪。命令行路径与版本随时可在下方核对。"}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => void checkAll()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-control px-2.5 py-1.5 text-meta font-medium text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-50">
          <RefreshCw size={12} aria-hidden="true" className={cn(busy && "animate-spin")} />
          {busy ? "正在检查…" : "全部检查更新"}
        </button>
      </div>
      {error && <p role="alert" className="mb-2 text-meta text-danger">{error}</p>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] items-start gap-2">
        {rows.map((instance) => <ProviderStatusCard key={instance.instanceId} instance={instance} />)}
      </div>
    </section>
  );
}
