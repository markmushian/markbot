import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, LogIn, TriangleAlert } from "lucide-react";
import { api, ApiError, useStore } from "@/state/store";
import { t } from "@/lib/i18n";
import { openExternalLink } from "@/lib/app-links";
import { engineSignedIn } from "@/lib/product-events";
import { type DeviceSignInStatus } from "./DeviceSignIn";

const SIGN_IN_HOSTS = ["claude.com", "claude.ai", "console.anthropic.com", "platform.claude.com"];
/** The CLI can finish through its localhost callback without ever showing a code; check the flow too. */
const CLAUDE_POLL_MS = 2_500;

/**
 * Security: never turn arbitrary process output into a link; only Anthropic's own sign-in pages over https. The server
 * applies the same rule first.
 */
export function claudeSignInLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const trusted = SIGN_IN_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
    return url.protocol === "https:" && trusted && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function ended(phase: "expired" | "failed", message?: string): DeviceSignInStatus {
  return { phase, flowId: null, authorizationUrl: null, expiresAt: null, ...(message ? { message } : {}) };
}

/** `autoStart` begins at once and opens Anthropic's page; `onDone` hears the outcome so an account list can close it. */
export function ClaudeSignIn({ instanceId, autoStart = false, onDone }: {
  instanceId: string;
  autoStart?: boolean;
  onDone?: (signedIn: boolean) => void;
}) {
  const { refreshInstances, refreshModels } = useStore();
  const [auth, setAuth] = useState<DeviceSignInStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"start" | "finish" | "cancel" | null>(autoStart ? "start" : null);
  const [error, setError] = useState<string | null>(null);
  const [checkTick, setCheckTick] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const base = `/api/instances/${encodeURIComponent(instanceId)}/auth`;
  const link = claudeSignInLink(auth?.authorizationUrl);

  const succeeded = async () => {
    setAuth({ phase: "succeeded", flowId: null, authorizationUrl: null, expiresAt: null });
    setCode("");
    engineSignedIn("claude", "code");
    // The sign-in already succeeded: a failed catalog refresh must not read as a failed sign-in.
    try { await refreshInstances(); } catch {}
    try { await refreshModels(instanceId); } catch {}
    // The engine rail caches Claude Code's subscription windows for 45s. Refresh them now that the
    // credentials exist, so the real numbers show up without the user having to press refresh.
    void api("/api/claude-code-usage?refresh=1").catch(() => {});
    onDone?.(true);
  };
  const succeededRef = useRef(succeeded);
  succeededRef.current = succeeded;

  // `claude auth login` prints "Paste code here if prompted": the code is only a fallback. When the browser
  // reaches the CLI's localhost callback, Claude Code signs itself in and exits, so this form must notice
  // the server-owned flow succeeded instead of waiting forever for a code the page never showed.
  useEffect(() => {
    if (auth?.phase !== "waiting" || !auth.flowId) return;
    const flowId = auth.flowId;
    const controller = new AbortController();
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      try {
        const { auth: next }: { auth: DeviceSignInStatus } = await api(
          `${base}/status?flowId=${encodeURIComponent(flowId)}`, { signal: controller.signal });
        if (stopped) return;
        if (next.phase === "succeeded") await succeededRef.current();
        else if (next.phase !== "waiting") setAuth(next);
      } catch { /* A transient status miss must not end a live sign-in. */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), CLAUDE_POLL_MS);
    return () => { stopped = true; controller.abort(); window.clearInterval(timer); };
  }, [auth?.phase, auth?.flowId, base, checkTick]);

  useEffect(() => {
    if (auth?.phase !== "waiting" || !auth.expiresAt) return;
    const remaining = Date.parse(auth.expiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = window.setTimeout(() => setAuth(ended("expired")), Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [auth]);

  const start = async () => {
    setBusy("start");
    setError(null);
    try {
      const { auth: next }: { auth: DeviceSignInStatus } = await api(`${base}/start`, { method: "POST" });
      setCode("");
      if (next.phase === "succeeded") return await succeeded();
      setAuth(next);
      const opened = claudeSignInLink(next.authorizationUrl);
      if (opened) await openExternalLink(opened).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("engineSetup.device.failed"));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void start();
  }, [autoStart]);

  // The server ends the flow once Claude Code accepts the code, so a 200 here is the sign-in itself.
  const finish = async () => {
    if (!auth?.flowId) return;
    setBusy("finish");
    setError(null);
    try {
      await api(`${base}/complete`, { method: "POST", body: JSON.stringify({ flowId: auth.flowId, code: code.trim() }) });
      await succeeded();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t("engineSetup.device.failed");
      if (cause instanceof ApiError && [401, 403, 404, 410].includes(cause.status)) {
        setAuth(ended("expired"));
        return;
      }
      // A code Claude Code refused ends the flow; one it never took (a typo) leaves it open to try again.
      const still = await api(`${base}/status?flowId=${encodeURIComponent(auth.flowId)}`)
        .then(({ auth: next }: { auth: DeviceSignInStatus }) => next.phase === "waiting")
        .catch(() => false);
      if (still) setError(message);
      else setAuth(ended("failed", message));
    } finally {
      setBusy(null);
    }
  };

  // The old button only re-ran the flow poll: while the CLI is still waiting for authorization it
  // changed nothing on screen, which reads as "the button is dead". Ask Claude Code directly, and
  // always say what was found -- including the case where the sign-in happened in a terminal.
  const checkNow = async () => {
    if (checking || !auth?.flowId) return;
    setChecking(true);
    setCheckMessage(null);
    try {
      const { auth: next }: { auth: DeviceSignInStatus } = await api(
        `${base}/status?flowId=${encodeURIComponent(auth.flowId)}`);
      if (next.phase === "succeeded") { await succeededRef.current(); return; }
      if (next.phase !== "waiting") {
        setAuth(next);
        setCheckMessage(t("engineSetup.device.expired"));
        return;
      }
      const { signedIn, status }: { signedIn: boolean; status: string } = await api(`${base}/state`);
      if (signedIn) { await succeededRef.current(); return; }
      setCheckMessage(status === "unknown" ? t("accounts.claude.checkUnavailable") : t("accounts.claude.stillWaiting"));
      setCheckTick((tick) => tick + 1);
    } catch {
      setCheckMessage(t("accounts.claude.checkUnavailable"));
    } finally {
      setChecking(false);
    }
  };

  const cancel = async () => {
    if (!auth?.flowId) return;
    setBusy("cancel");
    setError(null);
    try {
      await api(`${base}/cancel`, { method: "POST", body: JSON.stringify({ flowId: auth.flowId }) });
    } catch { /* The flow is gone either way. */ }
    setAuth(null);
    setBusy(null);
    onDone?.(false);
  };

  if (auth?.phase === "succeeded") {
    return <p role="status" data-claude-sign-in className="mt-3 text-note text-success">{t("engineSetup.claude.connected")}</p>;
  }

  if (auth?.phase === "waiting" && !link) {
    return <p role="alert" data-claude-sign-in className="mt-3 text-note text-danger">{t("engineSetup.claude.invalidChallenge")}</p>;
  }

  if (auth?.phase === "waiting" && link) {
    return (
      <form data-claude-sign-in className="mt-3 space-y-3 rounded-xl border border-hairline/50 bg-app p-3" onSubmit={(event) => { event.preventDefault(); void finish(); }}>
        <div role="note" className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-2">
          <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          <div className="min-w-0 space-y-1">
            <p className="text-meta font-semibold text-ink">{t("accounts.claude.planRequiredTitle")}</p>
            <p className="text-meta leading-relaxed text-ink-secondary">{t("accounts.claude.planRequiredBody")}</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-note font-medium text-ink">{t("accounts.claude.step1")}</p>
          <a href={link} target="_blank" rel="noopener noreferrer" onClick={(event) => {
            if (window.ogb?.openExternal) { event.preventDefault(); void openExternalLink(link); }
          }} className="flex w-fit items-center gap-1.5 rounded-lg bg-control px-3 py-1.5 text-note font-medium text-ink hover:bg-raised-hover">
            {t("accounts.claude.openAgain")} <ExternalLink size={12} />
          </a>
          <p className="mt-1 text-meta leading-relaxed text-ink-secondary">{t("accounts.claude.linkHint")}</p>
          <p className="mt-1 break-all rounded-lg bg-inset px-2 py-1.5 font-mono text-tiny leading-relaxed text-ink-secondary">{link}</p>
          <button type="button" onClick={() => {
            if (navigator.clipboard) void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => {});
          }} className="mt-1 rounded-lg px-2 py-1 text-meta font-medium text-accent-text hover:bg-control">
            {copied ? t("accounts.claude.copied") : t("accounts.claude.copyLink")}
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="block text-note font-medium text-ink" htmlFor={`claude-code-${instanceId}`}>{t("accounts.claude.step2")}</label>
          <div className="flex gap-2">
            <input
              id={`claude-code-${instanceId}`}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              placeholder={t("accounts.claude.codePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-hairline/40 bg-inset px-3 py-2 font-mono text-ui text-ink outline-none focus:border-accent-border"
            />
            <button type="submit" disabled={busy !== null || code.trim().length < 8} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-ui font-semibold text-white hover:brightness-110 disabled:opacity-50">
              {busy === "finish" && <Loader2 size={13} className="animate-spin" />}
              {busy === "finish" ? t("engineSetup.claude.finishing") : t("accounts.claude.finish")}
            </button>
          </div>
          <p className="text-meta leading-relaxed text-ink-secondary">{t("accounts.claude.codeHint")}</p>
        </div>
        {error && <p role="alert" className="text-note text-danger">{error}</p>}
        {checkMessage && <p role="status" className="text-meta leading-relaxed text-ink-secondary">{checkMessage}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-meta leading-relaxed text-ink-secondary">{t("accounts.claude.security")}</p>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" disabled={checking} onClick={() => void checkNow()} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-note font-medium text-accent-text hover:bg-control disabled:opacity-50">
              {checking && <Loader2 size={12} className="animate-spin" />}
              {checking ? t("accounts.claude.checking") : t("accounts.claude.checkStatus")}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void cancel()} className="rounded-lg px-2.5 py-1.5 text-note text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-50">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </form>
    );
  }

  const outcome = auth?.phase === "expired" ? t("engineSetup.device.expired")
    : auth?.phase === "failed" ? auth.message || t("engineSetup.device.failed") : null;
  return (
    <div className="mt-3 space-y-2" data-claude-sign-in>
      {outcome && <p role="status" className="text-note text-ink-secondary">{outcome}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void start()}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-ui font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
          {busy === "start" ? t("engineSetup.claude.starting") : auth || error ? t("engineSetup.device.tryAgain") : t("engineSetup.claude.start")}
        </button>
        {onDone && (auth || error) && busy === null && (
          <button type="button" onClick={() => onDone(false)} className="rounded-lg px-2.5 py-2 text-note text-ink-secondary hover:bg-control hover:text-ink">{t("common.cancel")}</button>
        )}
      </div>
      {error && <p role="alert" className="text-note text-danger">{error}</p>}
    </div>
  );
}
