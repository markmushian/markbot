import { useState } from "react";
import { Check, Clipboard, ShieldCheck, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import { copyText } from "@/lib/copy-text";
import { redactSecretsInText } from "../../shared/redact.ts";

/** An agent proposes a command; a human decides. Nothing here ever executes it.
 * The only two actions are "copy" and "open a blank terminal with the command
 * already on the clipboard" — the shell never receives the text as an argument
 * and no Enter is ever pressed on the user's behalf.
 */
export interface CommandProposal {
  id: string;
  command: string;
  /** Why the agent wants it, in its own words. */
  reason?: string;
  /** Working directory the command is meant for; shown, never applied. */
  cwd?: string;
  proposedBy?: string;
}

export const NO_AUTO_EXECUTE = "只复制到剪贴板 · 不会自动执行，也不会替你按回车";

export function commandPreview(command: string, limit = 240): string {
  const clean = redactSecretsInText(command.replace(/\s+/g, " ").trim());
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

export function ProposedCommandCard({ proposal, onDecide }: {
  proposal: CommandProposal;
  onDecide?: (decision: "copied" | "dismissed") => void;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed" | "opened">("idle");
  const [visible, setVisible] = useState(true);

  const copy = async () => {
    // The shared helper tries the web clipboard, then the desktop bridge, and
    // never throws. Copying is the ONLY thing a proposal does with the text.
    const result = await copyText(proposal.command);
    if (result === "copied") {
      setState("copied");
      onDecide?.("copied");
    } else {
      setState("failed");
    }
  };

  const openBlankTerminal = async () => {
    // The desktop channel copies the command and opens an EMPTY terminal. It
    // deliberately never places the text in a shell command line.
    const opened = await window.ogb?.openInstallTerminal?.(proposal.command);
    setState(opened ? "opened" : "copied");
    onDecide?.("copied");
  };

  if (!visible) return <div data-command-proposal-dismissed className="px-3 py-2 text-note text-ink-tertiary">已忽略这条命令提案。</div>;

  return (
    <div data-command-proposal={proposal.id} className="my-2 rounded-xl border border-hairline/50 bg-card p-3">
      <div className="flex min-w-0 items-center gap-2">
        <ShieldCheck size={15} className="shrink-0 text-success" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-note font-semibold text-ink">命令提案 · 需要你确认</span>
        {proposal.proposedBy && <span className="shrink-0 text-meta text-ink-tertiary">{proposal.proposedBy}</span>}
      </div>
      {proposal.reason && <p className="mt-1.5 text-note leading-relaxed text-ink-secondary">{proposal.reason}</p>}
      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-app px-2.5 py-2 font-mono text-meta leading-relaxed text-ink">{commandPreview(proposal.command)}</pre>
      {proposal.cwd && <div className="mt-1.5 truncate text-meta text-ink-tertiary" title={proposal.cwd}>建议工作目录：{proposal.cwd}</div>}
      <p className="mt-2 flex items-center gap-1.5 text-meta font-medium text-success"><ShieldCheck size={12} aria-hidden="true" />{NO_AUTO_EXECUTE}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => void copy()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-control px-2.5 py-1.5 text-note font-medium text-ink hover:bg-raised">
          {state === "copied" || state === "opened" ? <Check size={13} /> : <Clipboard size={13} />}
          {state === "failed" ? "复制失败，请手动选取" : state === "copied" ? "已复制" : "只复制命令"}
        </button>
        {window.ogb?.openInstallTerminal && (
          <button type="button" onClick={() => void openBlankTerminal()}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-note font-medium", state === "opened" ? "bg-success/10 text-success" : "bg-control text-ink hover:bg-raised")}>
            <TerminalSquare size={13} aria-hidden="true" />
            {state === "opened" ? "空白终端已打开" : "打开空白终端（命令已在剪贴板）"}
          </button>
        )}
        <button type="button" onClick={() => { setVisible(false); onDecide?.("dismissed"); }}
          className="ml-auto rounded-lg px-2 py-1.5 text-note text-ink-tertiary hover:text-ink">
          忽略
        </button>
      </div>
      {state === "opened" && <p role="status" className="mt-2 text-meta leading-relaxed text-ink-secondary">命令已复制到剪贴板，终端是空白的。请自己粘贴（Ctrl+V / Cmd+V）并确认无误后按回车 —— 我们不会替你执行。</p>}
    </div>
  );
}
