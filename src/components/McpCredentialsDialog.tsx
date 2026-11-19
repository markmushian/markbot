import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, X } from "lucide-react";

import { updateMcpServers } from "@/lib/mcp-servers";
import { cn } from "@/lib/cn";
import { api } from "@/state/store";

import { credentialAdvice, explainVerifyFailure, type McpCredentialField, type McpCredentialLink } from "../../shared/mcp-credentials.ts";
import { VERIFY_OUTCOME_LABEL, verifyOutcome } from "../../shared/verify-outcome.ts";
import type { McpServerListing } from "./mcp-draft";

export interface McpCredentialsOutcome {
  ok: boolean;
  tools?: number;
  error?: string;
  status?: number;
  reason?: "keys" | "unreachable" | "timeout";
}

interface ProbeAnswer {
  ok: boolean;
  tools?: Array<{ name: string }>;
  total?: number;
  error?: string;
  status?: number;
  reason?: "keys" | "unreachable" | "timeout";
}

const FIELD = "mt-1.5 h-9 w-full rounded-control border border-hairline/60 bg-inset px-3 text-ui text-ink outline-none placeholder:text-ink-tertiary focus:border-accent focus-visible:ring-2 focus-visible:ring-focus/50";
const LINK = "inline-flex items-center gap-1 text-note font-medium text-accent-text hover:underline";
const QUIET_BUTTON = "h-9 rounded-control px-3 text-ui text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40";
const PRIMARY_BUTTON = "flex h-9 items-center gap-1.5 rounded-control bg-accent px-3.5 text-ui font-medium text-white disabled:opacity-50";

function CredentialLink({ label, url }: McpCredentialLink) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={LINK}>
      <ExternalLink size={12} /> {label}
    </a>
  );
}

/** The one place a person types MCP credentials: it saves them, verifies the server really starts, and turns it on.
 * Secret values never come back from the server, so every field starts blank and blank means "keep what is saved". */
export function McpCredentialsDialog({ name, title, onClose, onSaved }: {
  name: string;
  title?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [fields, setFields] = useState<McpCredentialField[] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<"load" | "ready" | "saving" | "testing" | "done">("load");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<McpCredentialsOutcome | null>(null);
  const alive = useRef(true);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void api<{ servers?: McpServerListing[] }>("/api/mcp/servers", { signal: controller.signal })
      .then((result) => {
        if (!alive.current) return;
        const server = (result.servers ?? []).find((each) => each.name === name);
        setFields(server?.credentials ?? []);
        setOutcome(null);
        setPhase("ready");
      })
      .catch((cause) => {
        if (alive.current && !controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setPhase("ready");
        }
      });
    return () => { alive.current = false; controller.abort(); };
  }, [name]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phaseRef.current !== "saving" && phaseRef.current !== "testing") closeRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, []);

  const setValue = (token: string, value: string) => setValues((current) => ({ ...current, [token]: value }));

  const verify = async (): Promise<McpCredentialsOutcome> => {
    let probe: ProbeAnswer;
    try {
      probe = await api<ProbeAnswer>(`/api/mcp/servers/${encodeURIComponent(name)}/test`, { method: "POST" });
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
    }
    if (!probe.ok) return { ok: false, error: probe.error || "服务没有响应", ...(probe.status ? { status: probe.status } : {}), ...(probe.reason ? { reason: probe.reason } : {}) };
    const tools = Math.max(probe.total ?? 0, probe.tools?.length ?? 0);
    try {
      const enabled = await api<{ servers?: McpServerListing[] }>(`/api/mcp/servers/${encodeURIComponent(name)}`, {
        method: "PATCH", body: JSON.stringify({ enabled: true }),
      });
      updateMcpServers(enabled.servers ?? []);
    } catch {
      // The credentials are saved and the server answered; leaving the switch alone is not a failure of the fill-in.
    }
    return { ok: true, tools };
  };

  const save = async () => {
    const typed = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value.trim()).map(([token, value]) => [token, value.trim()]),
    );
    if (!Object.keys(typed).length) { setError("请至少填写一项凭证；已填写过的可以留空保持不变。"); return; }
    setError(null);
    setOutcome(null);
    setPhase("saving");
    try {
      const saved = await api<{ servers?: McpServerListing[] }>(`/api/mcp/servers/${encodeURIComponent(name)}/credentials`, {
        method: "POST", body: JSON.stringify({ values: typed }),
      });
      updateMcpServers(saved.servers ?? []);
      setValues({});
      if (!alive.current) return;
      setPhase("testing");
      const checked = await verify();
      if (!alive.current) return;
      setOutcome(checked);
      setPhase("done");
      const refreshed = await api<{ servers?: McpServerListing[] }>("/api/mcp/servers");
      if (!alive.current) return;
      setFields((refreshed.servers ?? []).find((each) => each.name === name)?.credentials ?? fields);
      updateMcpServers(refreshed.servers ?? []);
      onSaved?.();
    } catch (cause) {
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setPhase("ready");
      }
    }
  };

  const retry = async () => {
    setError(null);
    setPhase("testing");
    const checked = await verify();
    if (!alive.current) return;
    setOutcome(checked);
    setPhase("done");
    onSaved?.();
  };

  const busy = phase === "saving" || phase === "testing";
  const failure = outcome && !outcome.ok ? explainVerifyFailure(outcome.error ?? "", name) : null;
  const report = outcome ? verifyOutcome({ ok: outcome.ok, error: outcome.error, status: outcome.status, reason: outcome.reason }) : null;
  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-credentials-title"
        tabIndex={-1}
        className="animate-pop-in flex max-h-[min(720px,calc(100dvh-2rem))] w-full max-w-[520px] flex-col overflow-hidden rounded-panel border border-hairline/50 bg-panel shadow-xl outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline/40 px-6 pb-5 pt-6">
          <div className="min-w-0">
            <h2 id="mcp-credentials-title" className="truncate text-19 font-medium text-ink">{title ?? name}</h2>
            <p className="mt-1 text-ui leading-[18px] text-ink-secondary">
              填好凭证后会自动验证并启用，只保存在本机。
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="关闭"
            className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {phase === "load" ? (
            <div className="flex items-center justify-center gap-2 py-12 text-ui text-ink-secondary">
              <Loader2 size={15} className="animate-spin" /> 正在读取需要填写的项目…
            </div>
          ) : (fields ?? []).length === 0 ? (
            <div className="rounded-card bg-inset/60 px-4 py-8 text-center">
              <p className="text-ui text-ink-secondary">这个工具不需要填写凭证。</p>
              <p className="mt-1 text-note text-ink-tertiary">在应用列表里点「启用」即可，连接由工具自己完成。</p>
            </div>
          ) : (
            <div className="space-y-5">
              {(fields ?? []).map((field) => (
                <label key={field.token} className="block">
                  <span className="flex flex-wrap items-center justify-between gap-2 text-ui font-medium text-ink">
                    <span>{field.label}</span>
                    {field.filled && <span className="text-note font-normal text-success">已填写 · 留空不修改</span>}
                  </span>
                  <span className="mt-1 block text-note leading-4 text-ink-secondary">{field.hint}</span>
                  {(field.url || (field.links?.length ?? 0) > 0) && (
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {field.url && <CredentialLink label={field.urlLabel ?? "打开申请页面"} url={field.url} />}
                      {(field.links ?? []).map((link) => <CredentialLink key={link.url} {...link} />)}
                    </span>
                  )}
                  <span className="mt-1.5 flex items-center gap-2">
                    <input
                      type={field.secret && !shown[field.token] ? "password" : "text"}
                      value={values[field.token] ?? ""}
                      onChange={(event) => setValue(field.token, event.target.value)}
                      autoComplete="off" spellCheck={false} disabled={busy}
                      placeholder={field.filled ? "留空保持不变" : "必填"}
                      className={cn(FIELD, "mt-0 min-w-0 flex-1 font-mono text-note disabled:opacity-50")}
                    />
                    {field.secret && (
                      <button type="button" disabled={busy} aria-label={shown[field.token] ? "隐藏" : "显示"}
                        onClick={() => setShown((current) => ({ ...current, [field.token]: !current[field.token] }))}
                        className="shrink-0 rounded-control p-2 text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-40">
                        {shown[field.token] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    )}
                  </span>
                  {credentialAdvice(field.token, values[field.token] ?? "") && (
                    <span className="mt-1.5 block rounded-control bg-warning/10 px-2.5 py-1.5 text-note leading-4 text-warning">
                      {credentialAdvice(field.token, values[field.token] ?? "")}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
          {error && <p role="alert" className="mt-4 rounded-control bg-danger/10 px-3 py-2 text-note leading-4 text-danger">{error}</p>}
          {outcome?.ok && (
            <div role="status" className="mt-4 flex items-start gap-2 rounded-control bg-success/10 px-3 py-2 text-note leading-4 text-success">
              <CheckCircle2 size={15} className="mt-px shrink-0" />
              <span>已保存并验证成功{outcome.tools ? `，共 ${outcome.tools} 个工具` : ""}，工具已启用。</span>
            </div>
          )}
          {outcome && !outcome.ok && failure && (
            <div role="status" className="mt-4 rounded-control bg-warning/10 px-3 py-2.5 text-note leading-4 text-warning">
              <div className="font-medium">凭证已保存，但验证没通过 · {report ? VERIFY_OUTCOME_LABEL[report.outcome] : "验证失败"}</div>
              <div className="mt-1">{failure.message}</div>
              {report && <div className="mt-1 text-meta opacity-90">建议：{report.hint}</div>}
              <div className="mt-1.5 text-meta opacity-70">原始信息：{outcome.error}</div>
              <div className="mt-1">可以改好凭证后重新填写，或稍后点「重新验证」。</div>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline/40 px-6 py-3.5">
          <span className="text-note text-ink-tertiary">随时可以回来修改，不用在对话里配置。</span>
          <div className="flex items-center gap-1.5">
            {outcome && !outcome.ok && (
              <button type="button" disabled={busy} onClick={() => void retry()}
                className="h-9 rounded-control bg-control px-3 text-ui font-medium text-ink hover:bg-raised-hover disabled:opacity-40">
                重新验证
              </button>
            )}
            <button type="button" onClick={onClose} disabled={busy} className={QUIET_BUTTON}>
              {outcome?.ok ? "完成" : "关闭"}
            </button>
            {(fields ?? []).length > 0 && !outcome?.ok && (
              <button type="button" disabled={busy || phase === "load"} onClick={() => void save()} className={PRIMARY_BUTTON}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                {phase === "saving" ? "正在保存…" : phase === "testing" ? "正在验证…" : "保存并验证"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}
