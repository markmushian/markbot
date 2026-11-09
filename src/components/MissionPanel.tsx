import { useRef, useState } from "react";
import { Clipboard, CircleStop, GitMerge, Play, ShieldCheck, Sparkles } from "lucide-react";
import { api, type Bot } from "@/state/store";
import { cn } from "@/lib/cn";
import {
  MISSION_EVENT_LABEL, missionDuration, missionTrace, runMission,
  type MissionEventKind, type MissionState,
} from "@/lib/mission-orchestrator";

const EVENT_TONE: Record<MissionEventKind, string> = {
  planned: "bg-violet-500/10 text-violet-500",
  created: "bg-sky-500/10 text-sky-500",
  dispatched: "bg-sky-500/10 text-sky-500",
  running: "bg-accent/10 text-accent",
  completed: "bg-success/10 text-success",
  reported: "bg-violet-500/10 text-violet-500",
  review: "bg-warning/10 text-warning",
  rework: "bg-warning/10 text-warning",
  failed: "bg-danger/10 text-danger",
  blocked: "bg-danger/10 text-danger",
  done: "bg-success/10 text-success",
};

const STATUS_LABEL: Record<MissionState["status"], string> = {
  planning: "总监拆解中", running: "并行执行中", reviewing: "审核中",
  done: "已完成", failed: "失败", stopped: "已停止",
};

/** The visible half of the chief-of-staff orchestrator: one goal in, real
 * subtask cards out, and a complete run trace that stays on screen. */
export function MissionPanel({ chief, agents }: {
  chief?: Bot;
  agents: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [goal, setGoal] = useState("");
  const [state, setState] = useState<MissionState | null>(null);
  const [running, setRunning] = useState(false);
  const [reviewerId, setReviewerId] = useState("");
  const [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const workers = agents.filter((agent) => agent.id !== chief?.id);
  const reviewers = workers.filter((agent) => /审核|测试|review|qa|验收/i.test(agent.name));

  const start = async () => {
    const text = goal.trim();
    if (!text || !chief || running || workers.length === 0) return;
    const signal = new AbortController();
    controller.current = signal;
    setRunning(true);
    setState(null);
    try {
      await runMission({
        goal: text, chiefId: chief.id, agents,
        ...(reviewerId ? { reviewerId } : {}),
        signal: signal.signal, request: api as never, onChange: setState,
      });
    } finally {
      setRunning(false);
      controller.current = null;
    }
  };

  const copyTrace = async () => {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(missionTrace(state));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <section data-mission-panel className="mb-6 rounded-3xl border border-hairline/50 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500"><GitMerge size={18} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lead font-semibold text-ink">总监协作任务</h2>
          <p className="mt-0.5 text-meta leading-relaxed text-ink-secondary">
            总监自动拆分 → 创建多个独立子任务 → 并行执行 → 自动回报总监 → 审核不通过自动返工。全过程留痕。
          </p>
        </div>
        {state && <span className={cn("rounded-full px-2.5 py-1 text-meta font-medium",
          state.status === "done" ? "bg-success/10 text-success" : state.status === "failed" || state.status === "stopped" ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent")}>
          {STATUS_LABEL[state.status]}
        </span>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={2} disabled={running}
          placeholder={chief ? `给 ${chief.name} 一个可以拆成多个子任务的目标…` : "请先建立一名总监 Agent"}
          className="min-h-14 min-w-[240px] flex-1 resize-none rounded-xl border border-hairline/50 bg-app px-3 py-2 text-ui leading-5 text-ink outline-none placeholder:text-ink-secondary/60 focus:border-accent disabled:opacity-50" />
        {reviewers.length > 0 && (
          <label className="flex h-9 items-center gap-1.5 rounded-xl border border-hairline/50 bg-app px-2.5 text-meta text-ink-secondary">
            审核
            <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} disabled={running}
              className="bg-transparent text-meta text-ink outline-none">
              <option value="">不审核</option>
              {reviewers.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
        )}
        {running
          ? <button type="button" onClick={() => controller.current?.abort()} className="flex h-9 items-center gap-1.5 rounded-xl bg-danger px-3.5 text-note font-semibold text-white"><CircleStop size={14} /> 停止</button>
          : <button type="button" disabled={!chief || !goal.trim() || workers.length === 0} onClick={() => void start()}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-note font-semibold text-white disabled:opacity-35"><Play size={14} /> 启动协作</button>}
      </div>
      {!chief && <p className="mt-2 text-meta text-warning">当前没有总监 Agent，先创建一名总监再启动。</p>}
      {chief && workers.length === 0 && <p className="mt-2 text-meta text-warning">团队里还没有其他成员，总监无法派工。</p>}

      {state && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
          <div className="min-w-0 rounded-2xl border border-hairline/40 bg-app/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-note text-ink">子任务 · {state.subtasks.filter((item) => item.status === "done").length}/{state.subtasks.length} 完成</strong>
              <span className="text-tiny tabular-nums text-ink-tertiary">{Math.round(missionDuration(state) / 1000)}s · 返工 {state.reworks} 次</span>
            </div>
            {state.subtasks.length === 0 && state.status === "planning" && <p className="py-3 text-center text-meta text-ink-secondary">总监正在拆分目标…</p>}
            <ul className="space-y-1.5">
              {state.subtasks.map((item) => (
                <li key={item.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-card px-2.5 py-2">
                  <span className={cn("size-1.5 shrink-0 rounded-full",
                    item.status === "done" ? "bg-success" : item.status === "failed" ? "bg-danger" : item.status === "running" ? "bg-accent" : "bg-warning")} />
                  <span className="min-w-0 flex-1 truncate text-meta text-ink" title={item.instruction}>{item.title}</span>
                  <span className="shrink-0 text-tiny text-ink-tertiary">{agents.find((agent) => agent.id === item.assigneeId)?.name ?? item.assigneeId}</span>
                  {item.attempts > 1 && <span className="shrink-0 rounded bg-warning/10 px-1.5 text-tiny text-warning">返工 {item.attempts - 1}</span>}
                  {item.threadId && <span className="shrink-0 font-mono text-micro text-ink-tertiary/70">{item.threadId.slice(0, 8)}</span>}
                </li>
              ))}
            </ul>
            {state.error && <p role="alert" className="mt-2 text-meta leading-relaxed text-danger">{state.error}</p>}
            {state.report && <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-success/20 bg-success/5 p-2.5 text-meta leading-relaxed text-ink"><strong className="text-success">总监汇总报告</strong><p className="mt-1 whitespace-pre-wrap">{state.report}</p></div>}
          </div>

          <div className="min-w-0 rounded-2xl border border-hairline/40 bg-app/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong className="text-note text-ink">运行轨迹 · {state.timeline.length} 条</strong>
              <button type="button" onClick={() => void copyTrace()} className="inline-flex items-center gap-1 text-tiny text-accent-text hover:underline"><Clipboard size={11} />{copied ? "已复制" : "导出轨迹"}</button>
            </div>
            <ol className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {state.timeline.map((entry) => (
                <li key={entry.id} className="flex min-w-0 items-start gap-2 text-meta">
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-micro font-medium", EVENT_TONE[entry.kind])}>{MISSION_EVENT_LABEL[entry.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink" title={entry.detail}>{entry.label}</span>
                    {entry.actor && <span className="block truncate text-micro text-ink-tertiary">{entry.actor}{entry.durationMs ? ` · ${Math.round(entry.durationMs / 1000)}s` : ""}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {state?.status === "done" && <p className="mt-3 flex items-center gap-1.5 text-meta text-success"><ShieldCheck size={12} /> 所有子任务已创建为独立任务卡，可在左侧会话列表继续查看。</p>}
      {!state && <p className="mt-3 flex items-center gap-1.5 text-tiny text-ink-tertiary"><Sparkles size={12} /> 与上方「总监指令台」不同：这里会真的建多张任务卡并并行跑，不是轮流发言。</p>}
    </section>
  );
}
