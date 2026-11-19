/** A chief-of-staff run that actually creates several independent task cards.
 *
 * The existing group-goal-run is turn-taking: one coordinator names one member
 * per turn inside one room thread. This orchestrator does the other half —
 * the chief splits a goal into a structured plan, we create a real task/thread
 * per subtask, run them in parallel, have every result reported back to the
 * chief automatically, and rework rejected work with the reviewer's notes.
 * Every step is recorded in one durable timeline.
 */
import { runtimeError } from "../../shared/runtime-codes.ts";

export const MISSION_PLAN_OPEN = "<mission-plan>";
export const MISSION_PLAN_CLOSE = "</mission-plan>";

export interface MissionSubtask {
  id: string;
  title: string;
  assigneeId: string;
  instruction: string;
  /** Ids that must finish before this one starts. Empty = parallel immediately. */
  dependsOn?: string[];
}

export interface MissionPlan {
  goal: string;
  subtasks: MissionSubtask[];
}

export type MissionEventKind =
  | "planned" | "created" | "dispatched" | "running" | "completed" | "failed"
  | "reported" | "review" | "rework" | "blocked" | "done";

export interface MissionEvent {
  id: string;
  at: number;
  kind: MissionEventKind;
  label: string;
  actor?: string;
  detail?: string;
  threadId?: string;
  durationMs?: number;
}

export type MissionSubtaskStatus = "pending" | "running" | "done" | "failed" | "rework";

export interface MissionSubtaskState extends MissionSubtask {
  status: MissionSubtaskStatus;
  threadId?: string;
  output?: string;
  error?: string;
  attempts: number;
  review?: { passed: boolean; notes: string };
  startedAt?: number;
  finishedAt?: number;
}

export interface MissionState {
  id: string;
  goal: string;
  status: "planning" | "running" | "reviewing" | "done" | "failed" | "stopped";
  startedAt: number;
  finishedAt?: number;
  plan?: MissionPlan;
  subtasks: MissionSubtaskState[];
  timeline: MissionEvent[];
  report?: string;
  error?: string;
  reworks: number;
}

export const MISSION_EVENT_LABEL: Record<MissionEventKind, string> = {
  planned: "总监完成拆分", created: "子任务已创建", dispatched: "任务已派发", running: "执行中",
  completed: "已完成", failed: "失败", reported: "已回报总监", review: "审核", rework: "返工",
  blocked: "阻塞", done: "任务结束",
};

const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

/** The chief answers in a control envelope so prose around the JSON is harmless. */
export function parseMissionPlan(raw: string, fallbackGoal = ""): MissionPlan | null {
  const start = raw.lastIndexOf(MISSION_PLAN_OPEN);
  const end = raw.lastIndexOf(MISSION_PLAN_CLOSE);
  const payload = start >= 0 && end > start ? raw.slice(start + MISSION_PLAN_OPEN.length, end).trim() : raw.trim();
  const candidate = payload.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const rows = Array.isArray(parsed.subtasks) ? parsed.subtasks : null;
    if (!rows) return null;
    const subtasks: MissionSubtask[] = rows.flatMap((row, index) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const title = text(item.title, 160);
      const assigneeId = text(item.assigneeId ?? item.assignee, 80);
      const instruction = text(item.instruction ?? item.task, 4_000);
      if (!title || !assigneeId || !instruction) return [];
      const dependsOn = Array.isArray(item.dependsOn) ? item.dependsOn.filter((id): id is string => typeof id === "string").slice(0, 8) : [];
      return [{ id: text(item.id, 40) || `s${index + 1}`, title, assigneeId, instruction, ...(dependsOn.length ? { dependsOn } : {}) }];
    });
    if (!subtasks.length) return null;
    return { goal: text(parsed.goal, 500) || fallbackGoal, subtasks: subtasks.slice(0, 12) };
  } catch {
    return null;
  }
}

export function validateMissionPlan(plan: MissionPlan, agentIds: ReadonlySet<string>): string | null {
  if (!plan.subtasks.length) return "总监没有拆出任何子任务。";
  if (plan.subtasks.length > 12) return "单次协作最多 12 个子任务。";
  const ids = new Set<string>();
  for (const subtask of plan.subtasks) {
    if (ids.has(subtask.id)) return `子任务 ID 重复：${subtask.id}`;
    ids.add(subtask.id);
    if (!agentIds.has(subtask.assigneeId)) return `子任务“${subtask.title}”指派了不存在的助手。`;
    if (!subtask.instruction.trim()) return `子任务“${subtask.title}”缺少交办内容。`;
  }
  for (const subtask of plan.subtasks) {
    for (const dependency of subtask.dependsOn ?? []) {
      if (!ids.has(dependency)) return `子任务“${subtask.title}”依赖了不存在的 ${dependency}。`;
      if (dependency === subtask.id) return "子任务不能依赖自己。";
    }
  }
  return null;
}

/** Reviewers are asked to answer with an explicit verdict line. */
export function reviewVerdict(raw: string): { passed: boolean; notes: string } {
  const value = raw.trim();
  const explicit = /(?:^|\n)\s*(?:结论|verdict)\s*[:：]\s*(不通过|通过|fail|pass)/i.exec(value);
  // "不通过" contains "通过": match the whole token or a rejection is read as approval.
  if (explicit) return { passed: /^(?:通过|pass)$/i.test(explicit[1]!), notes: value };
  const positive = /(?:^|[\s，。.!])通过(?:$|[\s，。.!])|approved|lgtm|全部合格|验收通过/i.test(value);
  const negative = /不通过|驳回|返工|需要修改|rejected|fail|缺少|问题|不足/i.test(value);
  return { passed: positive && !negative, notes: value };
}

export function chiefPlanningPrompt(goal: string, agents: ReadonlyArray<{ id: string; name: string }>, maxSubtasks = 6): string {
  return [
    "你是项目总监。把下面的目标拆成可以并行执行的子任务，每个子任务指派一位成员。",
    `可选成员（必须用这里的 id）：${agents.map((agent) => `${agent.name}=${agent.id}`).join("、")}`,
    `最多 ${maxSubtasks} 个子任务；能并行的不要标 dependsOn，确实有先后依赖才标。`,
    "只输出一个 JSON，用 <mission-plan> 和 </mission-plan> 包起来，格式：",
    '{"goal":"...","subtasks":[{"id":"s1","title":"...","assigneeId":"...","instruction":"...","dependsOn":[]}]}',
    "instruction 要写成可直接执行的完整交办，不要写成大纲。不要输出 JSON 以外的解释。",
    "",
    `【目标】\n${goal}`,
  ].join("\n");
}

export function chiefReportPrompt(goal: string, results: ReadonlyArray<{ title: string; output: string }>): string {
  return [
    "你是项目总监。以下是各子任务的真实执行结果，请汇总成一份可直接验收的报告：",
    `【原目标】${goal}`,
    ...results.map((result, index) => `【子任务 ${index + 1}：${result.title}】\n${result.output.slice(0, 6_000)}`),
    "报告要写清：交付了什么、验证证据、已知风险、还需人工确认的事项。",
  ].join("\n\n");
}

export function reworkPrompt(original: string, notes: string, attempt: number): string {
  return [
    `第 ${attempt} 次返工。上一次交付没有通过独立审核，请按审核意见修改后重新交付完整产物。`,
    `【原交办】\n${original}`,
    `【审核意见】\n${notes.slice(0, 6_000)}`,
    "只输出修改后的最终产物，不要解释过程。",
  ].join("\n\n");
}

export function reviewPrompt(goal: string, outputs: ReadonlyArray<{ title: string; output: string }>): string {
  return [
    "你是独立审核员。检查下列交付是否完整、正确、可验收。",
    `【原目标】${goal}`,
    ...outputs.map((item, index) => `【交付 ${index + 1}：${item.title}】\n${item.output.slice(0, 6_000)}`),
    "最后必须单独一行输出：结论：通过 或 结论：不通过，并在前面写清具体问题和修改要求。",
  ].join("\n\n");
}

export function event(kind: MissionEventKind, label: string, patch: Partial<MissionEvent> = {}): MissionEvent {
  return { id: crypto.randomUUID(), at: Date.now(), kind, label, ...patch };
}

export function missionDuration(state: MissionState): number {
  return (state.finishedAt ?? Date.now()) - state.startedAt;
}

/** Human-readable, redacted run trace for export or the timeline panel. */
export function missionTrace(state: MissionState): string {
  const head = `${state.goal} · ${state.status} · ${state.timeline.length} 个事件 · ${state.subtasks.length} 个子任务`;
  return [head, ...state.timeline.map((entry) =>
    `[${new Date(entry.at).toISOString()}] ${MISSION_EVENT_LABEL[entry.kind]} · ${entry.label}${entry.actor ? ` (${entry.actor})` : ""}${entry.detail ? `\n    ${entry.detail.slice(0, 400)}` : ""}`,
  )].join("\n");
}

// ---------------------------------------------------------------------------
// Runtime orchestration. The request function is injectable so this can be
// unit-tested without a server.
// ---------------------------------------------------------------------------

type SendReceipt = { threadId: string; message?: { id: string }; queued?: boolean };
type Message = { id: string; role: "user" | "bot"; kind: string; text?: string; requestMessageId?: string; turnTerminal?: boolean; turnSucceeded?: boolean; requestPending?: boolean };
type MessagePage = { messages: Message[] };
type Request = <T>(path: string, init?: { method?: string; body?: string; signal?: AbortSignal }) => Promise<T>;

const WAIT_MS = 10 * 60_000;
const POLL_MS = 900;

async function waitForTurn(request: Request, threadId: string, userMessageId: string, signal: AbortSignal): Promise<string> {
  const end = Date.now() + WAIT_MS;
  while (Date.now() < end) {
    if (signal.aborted) throw new Error("协作任务已停止；已派发的子任务可能仍在执行。");
    const page = await request<MessagePage>(`/api/threads/${threadId}/messages?limit=200`, { signal });
    const final = page.messages.find((message) => message.role === "bot" && message.requestMessageId === userMessageId && message.turnTerminal);
    if (final) {
      if (final.turnSucceeded === false) throw new Error(final.text?.trim() || "助手执行失败。");
      return (final.text ?? "").trim();
    }
    const requestLine = page.messages.find((message) => message.id === userMessageId);
    if (requestLine?.requestPending === false) throw new Error("助手任务已结束，但没有返回可用结果。");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal.removeEventListener("abort", cancelled); resolve(); }, POLL_MS);
      const cancelled = () => { clearTimeout(timer); reject(new Error("协作任务已停止。")); };
      signal.addEventListener("abort", cancelled, { once: true });
    });
  }
  throw new Error("等待助手结果超过 10 分钟，协作任务已停止。");
}

async function ask(request: Request, botId: string, prompt: string, signal: AbortSignal, threadId?: string): Promise<{ text: string; threadId: string }> {
  const receipt = await request<SendReceipt>(`/api/bots/${botId}/messages`, {
    method: "POST", body: JSON.stringify({ text: prompt, sendId: crypto.randomUUID(), ...(threadId ? { threadId } : {}) }), signal,
  });
  if (receipt.queued || !receipt.message?.id || !receipt.threadId) throw new Error(`助手 ${botId} 没有接受任务。`);
  return { text: await waitForTurn(request, receipt.threadId, receipt.message.id, signal), threadId: receipt.threadId };
}

export interface RunMissionOptions {
  goal: string;
  chiefId: string;
  agents: ReadonlyArray<{ id: string; name: string }>;
  reviewerId?: string;
  maxReworks?: number;
  signal: AbortSignal;
  request: Request;
  onChange: (state: MissionState) => void;
  id?: string;
  /** Skip the planning call when a plan was produced elsewhere (e.g. workflow architect). */
  plan?: MissionPlan;
}

export async function runMission(options: RunMissionOptions): Promise<MissionState> {
  const { request, signal, onChange } = options;
  const startedAt = Date.now();
  let state: MissionState = {
    id: options.id ?? crypto.randomUUID(), goal: options.goal.trim(), status: "planning",
    startedAt, subtasks: [], timeline: [event("planned", "开始拆分目标")], reworks: 0,
  };
  const publish = () => onChange(state);
  const add = (kind: MissionEventKind, label: string, patch: Partial<MissionEvent> = {}) => {
    state = { ...state, timeline: [...state.timeline, event(kind, label, patch)] };
    publish();
  };
  const patchSubtask = (id: string, patch: Partial<MissionSubtaskState>) => {
    state = { ...state, subtasks: state.subtasks.map((item) => item.id === id ? { ...item, ...patch } : item) };
    publish();
  };
  const finish = (status: MissionState["status"], patch: Partial<MissionState> = {}) => {
    state = { ...state, status, finishedAt: Date.now(), ...patch };
    add(status === "done" ? "done" : "failed", status === "done" ? "协作任务完成" : "协作任务结束");
    return state;
  };
  publish();

  try {
    let plan = options.plan ?? null;
    if (!plan) {
      add("planned", "总监正在拆分目标", { actor: options.chiefId });
      const answer = await ask(request, options.chiefId,
        chiefPlanningPrompt(options.goal, options.agents.filter((agent) => agent.id !== options.chiefId)), signal);
      plan = parseMissionPlan(answer.text, options.goal);
      if (!plan) throw new Error("总监没有返回可解析的子任务拆分，请重试或把目标写得更具体。");
    }
    const invalid = validateMissionPlan(plan, new Set(options.agents.map((agent) => agent.id)));
    if (invalid) throw new Error(invalid);
    state = { ...state, plan, status: "running", subtasks: plan.subtasks.map((subtask) => ({ ...subtask, status: "pending", attempts: 0 })) };
    add("planned", `拆出 ${plan.subtasks.length} 个子任务`, { actor: options.chiefId, detail: plan.subtasks.map((item) => item.title).join("、") });
    publish();

    const runOne = async (subtask: MissionSubtask, instruction: string): Promise<void> => {
      const started = Date.now();
      patchSubtask(subtask.id, { status: "running", startedAt: started, attempts: state.subtasks.find((item) => item.id === subtask.id)!.attempts + 1 });
      // A real task card, not just a message in the chief's thread.
      const created = await request<{ task?: { threadId?: string } }>(`/api/bots/${subtask.assigneeId}/tasks`, {
        method: "POST", body: JSON.stringify({ title: subtask.title, select: false }), signal,
      });
      const threadId = created.task?.threadId;
      add("created", `「${subtask.title}」已创建为独立任务`, { actor: subtask.assigneeId, ...(threadId ? { threadId } : {}) });
      if (threadId) patchSubtask(subtask.id, { threadId });
      const receipt = await request<SendReceipt>(`/api/bots/${subtask.assigneeId}/messages`, {
        method: "POST", body: JSON.stringify({ text: instruction, sendId: crypto.randomUUID(), ...(threadId ? { threadId } : {}) }), signal,
      });
      if (receipt.queued || !receipt.message?.id || !receipt.threadId) {
        const failure = runtimeError("ROOM_DELEGATE_FAILED");
        throw new Error(`${failure.message}${failure.hint}`);
      }
      add("dispatched", `已派发给 ${options.agents.find((agent) => agent.id === subtask.assigneeId)?.name ?? subtask.assigneeId}`,
        { actor: subtask.assigneeId, threadId: receipt.threadId, detail: instruction.slice(0, 200) });
      const output = await waitForTurn(request, receipt.threadId, receipt.message.id, signal);
      if (!output) throw new Error("助手没有返回可验收的文字结果。");
      patchSubtask(subtask.id, { status: "done", output, finishedAt: Date.now() });
      add("completed", `「${subtask.title}」完成`, { actor: subtask.assigneeId, threadId: receipt.threadId, durationMs: Date.now() - started, detail: output.slice(0, 300) });
    };

    // Dependency-aware waves: everything with no pending dependency runs side by side.
    const waves = missionWaves(plan.subtasks);
    for (const wave of waves) {
      if (signal.aborted) return finish("stopped");
      await Promise.all(wave.map((subtask) => runOne(subtask, subtask.instruction)));
    }

    // Every result goes back to the chief automatically.
    const results = state.subtasks.filter((item) => item.status === "done").map((item) => ({ title: item.title, output: item.output ?? "" }));
    add("reported", `把 ${results.length} 份结果回报总监`, { actor: options.chiefId });
    const report = await ask(request, options.chiefId, chiefReportPrompt(options.goal, results), signal);
    state = { ...state, report: report.text };
    publish();

    if (options.reviewerId) {
      const maxReworks = Math.max(0, options.maxReworks ?? 2);
      for (let attempt = 0; attempt <= maxReworks; attempt++) {
        if (signal.aborted) return finish("stopped");
        state = { ...state, status: "reviewing" }; publish();
        const review = await ask(request, options.reviewerId, reviewPrompt(options.goal, results), signal);
        const verdict = reviewVerdict(review.text);
        add("review", verdict.passed ? "审核通过" : "审核不通过", { actor: options.reviewerId, detail: verdict.notes.slice(0, 500) });
        if (verdict.passed) return finish("done");
        if (attempt === maxReworks) {
          add("blocked", "返工次数已用尽", { detail: runtimeError("WORKFLOW_RETRY_EXHAUSTED").hint });
          return finish("failed", { error: runtimeError("WORKFLOW_RETRY_EXHAUSTED").message });
        }
        state = { ...state, reworks: state.reworks + 1 };
        add("rework", `第 ${attempt + 1} 次自动返工`, { detail: verdict.notes.slice(0, 500) });
        // Rework the first delivered subtask with the reviewer's notes, then re-report.
        const target = state.subtasks.find((item) => item.status === "done");
        if (!target) return finish("failed", { error: "没有可返工的交付。" });
        const reworked = await ask(request, target.assigneeId, reworkPrompt(target.instruction, verdict.notes, attempt + 1), signal, target.threadId);
        patchSubtask(target.id, { status: "done", output: reworked.text, finishedAt: Date.now() });
        results.splice(0, results.length, ...state.subtasks.filter((item) => item.status === "done").map((item) => ({ title: item.title, output: item.output ?? "" })));
        add("reported", "返工结果已回报总监", { actor: options.chiefId });
        state = { ...state, report: (await ask(request, options.chiefId, chiefReportPrompt(options.goal, results), signal)).text };
        publish();
      }
    }
    return finish("done");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    add("failed", "协作任务中断", { detail: message });
    return finish(signal.aborted ? "stopped" : "failed", { error: message });
  }
}

/** Topological waves, so `dependsOn` still runs after its prerequisites. */
export function missionWaves(subtasks: readonly MissionSubtask[]): MissionSubtask[][] {
  const done = new Set<string>();
  const remaining = [...subtasks];
  const waves: MissionSubtask[][] = [];
  while (remaining.length) {
    const wave = remaining.filter((item) => (item.dependsOn ?? []).every((id) => done.has(id)));
    if (!wave.length) {
      // A cycle: run the rest together rather than deadlocking the mission.
      waves.push([...remaining]);
      break;
    }
    waves.push(wave);
    for (const item of wave) { done.add(item.id); remaining.splice(remaining.indexOf(item), 1); }
  }
  return waves;
}
