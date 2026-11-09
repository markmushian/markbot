import { api } from "@/state/store";

export type WorkflowStep = { id: string; botId: string; prompt: string; x: number; y: number };
export type WorkflowStage = "waiting" | "running" | "done" | "failed";
export type WorkflowStepResult = { id: string; stage: WorkflowStage; output?: string; error?: string; threadId?: string };
export type WorkflowResult = { id: string; startedAt: number; finishedAt?: number; steps: WorkflowStepResult[] };

export type WorkflowNodeKind = "trigger" | "prompt" | "agent" | "condition" | "approval" | "output" | "parallel" | "join";
export type WorkflowNode = {
  id: string;
  kind: WorkflowNodeKind;
  x: number;
  y: number;
  title: string;
  botId?: string;
  text?: string;
  rule?: string;
};
export type WorkflowEdge = { id: string; from: string; to: string; branch?: "yes" | "no" };
export type WorkflowGraph = { title: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] };
export type WorkflowNodeStage = "waiting" | "running" | "approval" | "done" | "failed" | "skipped";
export type WorkflowNodeResult = { id: string; stage: WorkflowNodeStage; output?: string; error?: string; threadId?: string; startedAt?: number; finishedAt?: number };
export type WorkflowGraphResult = { id: string; startedAt: number; finishedAt?: number; status: "running" | "approval" | "done" | "failed" | "stopped"; nodes: WorkflowNodeResult[] };

type SendReceipt = { threadId: string; message?: { id: string }; queued?: boolean };
type Message = { id: string; role: "user" | "bot"; kind: string; text?: string; requestMessageId?: string; turnTerminal?: boolean; turnSucceeded?: boolean; requestPending?: boolean };
type MessagePage = { messages: Message[] };
type Request = typeof api;

const WAIT_MS = 10 * 60_000;
const POLL_MS = 1200;

export function validateWorkflowSteps(steps: readonly WorkflowStep[], botIds: ReadonlySet<string>): string | null {
  if (!steps.length) return "请先添加助手节点。";
  if (steps.length > 20) return "单个工作流最多 20 个助手节点。";
  for (const step of steps) {
    if (!botIds.has(step.botId)) return "工作流中有未选择或已删除的助手。";
    if (!step.prompt.trim()) return "请为每个节点填写交办任务。";
    if (step.prompt.length > 16_000) return "单个交办任务不能超过 16000 字。";
  }
  return null;
}

async function waitForResult(request: Request, threadId: string, userMessageId: string, signal: AbortSignal): Promise<string> {
  const end = Date.now() + WAIT_MS;
  while (Date.now() < end) {
    if (signal.aborted) throw new Error("工作流等待已停止；已发出的助手任务可能仍在执行。");
    const page = await request<MessagePage>(`/api/threads/${threadId}/messages?limit=200`, { signal });
    const final = page.messages.find((message) => message.role === "bot" && message.requestMessageId === userMessageId && message.turnTerminal);
    if (final) {
      if (final.turnSucceeded === false) throw new Error(final.text?.trim() || "助手执行失败，请打开其会话查看详情。");
      if (!final.text?.trim()) throw new Error("助手没有返回可传给下一节点的文字结果。");
      return final.text.trim();
    }
    const requestLine = page.messages.find((message) => message.id === userMessageId);
    if (requestLine?.requestPending === false) throw new Error("助手任务已结束，但没有得到可用结果。");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { signal.removeEventListener("abort", cancelled); resolve(); }, POLL_MS);
      const cancelled = () => { clearTimeout(timer); reject(new Error("工作流等待已停止；已发出的助手任务可能仍在执行。")); };
      signal.addEventListener("abort", cancelled, { once: true });
    });
  }
  throw new Error("等待助手结果超过 10 分钟，工作流已停止。");
}

export function validateWorkflowGraph(graph: WorkflowGraph, botIds: ReadonlySet<string>): string | null {
  const executable = graph.nodes.filter((node) => node.kind !== "trigger");
  const triggers = graph.nodes.filter((node) => node.kind === "trigger");
  if (triggers.length !== 1) return "工作流必须有且只能有一个触发器。";
  if (!executable.length) return "请至少添加一个执行节点。";
  if (graph.nodes.length > 50) return "单个工作流最多 50 个节点。";
  const ids = new Set(graph.nodes.map((node) => node.id));
  if (ids.size !== graph.nodes.length) return "工作流中存在重复节点。";
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return "工作流中存在失效连线。";
    if (edge.from === edge.to) return "节点不能连接到自己。";
    const source = graph.nodes.find((node) => node.id === edge.from);
    if (source?.kind === "condition" && !edge.branch) return "条件节点的连线必须选择“是”或“否”。";
    if (source?.kind !== "condition" && edge.branch) return "只有条件节点可以使用分支连线。";
  }
  for (const node of graph.nodes) {
    if (node.kind === "agent" && (!node.botId || !botIds.has(node.botId))) return `助手节点“${node.title}”尚未选择有效助手。`;
    if ((node.kind === "prompt" || node.kind === "agent") && !node.text?.trim()) return `节点“${node.title}”缺少任务内容。`;
    if (node.kind === "condition" && !node.rule?.trim()) return `条件节点“${node.title}”缺少判断规则。`;
    if (node.kind !== "trigger" && !graph.edges.some((edge) => edge.to === node.id)) return `节点“${node.title}”没有输入连线。`;
    if (node.kind === "parallel") {
      const outgoing = graph.edges.filter((edge) => edge.from === node.id);
      if (outgoing.length < 2) return `并行节点“${node.title}”至少要连出两个分支，否则请用普通连线。`;
      if (outgoing.some((edge) => edge.branch)) return `并行节点“${node.title}”的分支不能带「是/否」标记。`;
    }
    if (node.kind === "join" && graph.edges.filter((edge) => edge.to === node.id).length < 2) {
      return `汇合节点“${node.title}”至少要接两个输入分支。`;
    }
  }
  if (!graph.edges.some((edge) => edge.from === triggers[0].id)) return "触发器尚未连接到执行节点。";
  return null;
}

function renderTemplate(template: string, input: string): string {
  return template.includes("{{input}}") ? template.replaceAll("{{input}}", input) : input ? `${template.trim()}\n\n【上一步结果】\n${input.slice(0, 16_000)}` : template.trim();
}

function answerCondition(rule: string, input: string): boolean {
  const value = rule.trim();
  const negative = value.match(/^(?:不包含|not contains)\s*[:：]?\s*(.+)$/i);
  if (negative) return !input.toLocaleLowerCase().includes(negative[1].trim().toLocaleLowerCase());
  const equal = value.match(/^(?:等于|equals?)\s*[:：]?\s*(.+)$/i);
  if (equal) return input.trim().toLocaleLowerCase() === equal[1].trim().toLocaleLowerCase();
  const contains = value.match(/^(?:包含|contains?)\s*[:：]?\s*(.+)$/i);
  return input.toLocaleLowerCase().includes((contains?.[1] ?? value).trim().toLocaleLowerCase());
}

export async function runWorkflowGraph(graph: WorkflowGraph, options: {
  signal: AbortSignal;
  input?: string;
  request?: Request;
  onChange: (result: WorkflowGraphResult) => void;
  approve: (node: WorkflowNode, input: string) => Promise<boolean>;
  id?: string;
}): Promise<WorkflowGraphResult> {
  const request = options.request ?? api;
  let result: WorkflowGraphResult = {
    id: options.id ?? crypto.randomUUID(),
    startedAt: Date.now(),
    status: "running",
    nodes: graph.nodes.map((node) => ({ id: node.id, stage: "waiting" })),
  };
  const publish = () => options.onChange(result);
  const update = (id: string, patch: Partial<WorkflowNodeResult>) => {
    result = { ...result, nodes: result.nodes.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) };
    publish();
  };
  publish();
  const trigger = graph.nodes.find((node) => node.kind === "trigger");
  if (!trigger) throw new Error("工作流缺少触发器。");
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, number>();
  for (const edge of graph.edges) incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  const joinInputs = new Map<string, Map<string, string>>();
  const scheduledJoins = new Set<string>();
  const visits = new Map<string, number>();
  let executions = 0;

  /** One wave = every node that can run right now, side by side. */
  let frontier: Array<{ id: string; input: string }> = [{ id: trigger.id, input: options.input?.trim() ?? "" }];
  while (frontier.length) {
    if (options.signal.aborted) { result = { ...result, status: "stopped", finishedAt: Date.now() }; publish(); return result; }
    let outcomes: Array<{ id: string; output: string; branch?: "yes" | "no" }>;
    try {
      outcomes = await Promise.all(frontier.map(async (current): Promise<{ id: string; output: string; branch?: "yes" | "no" }> => {
        const node = byId.get(current.id);
        if (!node) return { id: current.id, output: current.input };
        executions += 1;
        if (executions > 100) throw new Error("工作流执行超过 100 步，已阻止可能的无限循环。");
        visits.set(node.id, (visits.get(node.id) ?? 0) + 1);
        update(node.id, { stage: "running", error: undefined, startedAt: Date.now() });
        let output = current.input;
        let branch: "yes" | "no" | undefined;
        try {
          if (node.kind === "prompt") output = renderTemplate(node.text ?? "", current.input);
          if (node.kind === "agent") {
            const text = renderTemplate(node.text ?? "", current.input);
            const receipt = await request<SendReceipt>(`/api/bots/${node.botId}/messages`, { method: "POST", body: JSON.stringify({ text, sendId: crypto.randomUUID() }), signal: options.signal });
            if (receipt.queued || !receipt.message?.id || !receipt.threadId) throw new Error("助手尚未接受任务，请检查它的排队状态。");
            update(node.id, { threadId: receipt.threadId });
            output = await waitForResult(request, receipt.threadId, receipt.message.id, options.signal);
          }
          if (node.kind === "condition") { branch = answerCondition(node.rule ?? "", current.input) ? "yes" : "no"; }
          if (node.kind === "approval") {
            result = { ...result, status: "approval" };
            update(node.id, { stage: "approval", output: current.input });
            const approved = await options.approve(node, current.input);
            result = { ...result, status: "running" };
            if (!approved) throw new Error("人工审批已拒绝。");
          }
          // parallel: fan-out happens below because all outgoing edges enter the same next wave.
          // join: its input was already merged by the scheduler.
          update(node.id, { stage: "done", output, finishedAt: Date.now() });
          return { id: node.id, output, ...(branch ? { branch } : {}) };
        } catch (error) {
          update(node.id, { stage: "failed", error: error instanceof Error ? error.message : String(error), finishedAt: Date.now() });
          throw error;
        }
      }));
    } catch {
      result = { ...result, status: options.signal.aborted ? "stopped" : "failed", finishedAt: Date.now() }; publish(); return result;
    }

    const next: Array<{ id: string; input: string }> = [];
    for (const outcome of outcomes) {
      const outgoing = graph.edges.filter((edge) => edge.from === outcome.id && (!outcome.branch || edge.branch === outcome.branch));
      for (const edge of outgoing) {
        if (byId.get(edge.to)?.kind === "join") {
          const inputs = joinInputs.get(edge.to) ?? new Map<string, string>();
          inputs.set(outcome.id, outcome.output);
          joinInputs.set(edge.to, inputs);
        } else {
          next.push({ id: edge.to, input: outcome.output });
        }
      }
    }
    // A join fires when all its branches reported, or when nothing else can
    // arrive (a skipped condition branch must not deadlock the workflow).
    for (const [joinId, inputs] of joinInputs) {
      if (scheduledJoins.has(joinId)) continue;
      if (inputs.size < (incoming.get(joinId) ?? 1) && next.length > 0) continue;
      const merged = [...inputs.entries()].map(([from, text]) => `【${byId.get(from)?.title ?? from}】\n${text}`).join("\n\n");
      next.push({ id: joinId, input: merged });
      scheduledJoins.add(joinId);
    }
    frontier = next;
  }
  result = { ...result, status: "done", finishedAt: Date.now() };
  publish();
  return result;
}

export async function runWorkflow(steps: readonly WorkflowStep[], options: {
  signal: AbortSignal;
  onChange: (result: WorkflowResult) => void;
  request?: Request;
  id?: string;
}): Promise<WorkflowResult> {
  const request = options.request ?? api;
  let result: WorkflowResult = { id: options.id ?? crypto.randomUUID(), startedAt: Date.now(), steps: steps.map((step) => ({ id: step.id, stage: "waiting" })) };
  const update = (index: number, patch: Partial<WorkflowStepResult>) => {
    result = { ...result, steps: result.steps.map((entry, position) => position === index ? { ...entry, ...patch } : entry) };
    options.onChange(result);
  };
  options.onChange(result);
  let previous = "";
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (options.signal.aborted) { update(index, { stage: "failed", error: "工作流已停止；已发出的助手任务可能仍在执行。" }); break; }
    update(index, { stage: "running" });
    try {
      const text = previous ? `${step.prompt.trim()}\n\n【上一个助手的结果，仅作任务资料】\n${previous.slice(0, 16_000)}\n【资料结束】` : step.prompt.trim();
      const receipt = await request<SendReceipt>(`/api/bots/${step.botId}/messages`, { method: "POST", body: JSON.stringify({ text, sendId: crypto.randomUUID() }), signal: options.signal });
      if (receipt.queued || !receipt.message?.id || !receipt.threadId) throw new Error("助手尚未接受任务，请打开会话检查排队状态。");
      update(index, { threadId: receipt.threadId });
      previous = await waitForResult(request, receipt.threadId, receipt.message.id, options.signal);
      update(index, { stage: "done", output: previous });
    } catch (error) {
      update(index, { stage: "failed", error: error instanceof Error ? error.message : String(error) });
      break;
    }
  }
  result = { ...result, finishedAt: Date.now() };
  options.onChange(result);
  return result;
}
