import { describe, expect, it, vi } from "vitest";
import { runWorkflow, runWorkflowGraph, validateWorkflowGraph, validateWorkflowSteps, type WorkflowGraph, type WorkflowNode, type WorkflowStep } from "./workflow-runner";

const steps: WorkflowStep[] = [
  { id: "a", botId: "bot-a", prompt: "研究问题", x: 0, y: 0 },
  { id: "b", botId: "bot-b", prompt: "根据研究写结论", x: 200, y: 0 },
];

describe("workflow runner", () => {
  it("passes a settled assistant result to the next bot", async () => {
    const sent: Array<{ path: string; text: string }> = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        sent.push({ path, text: JSON.parse(String(init.body)).text });
        const index = sent.length;
        return { threadId: `thread-${index}`, message: { id: `user-${index}` } };
      }
      const index = path.includes("thread-1") ? 1 : 2;
      return { messages: [{ id: `bot-${index}`, role: "bot", kind: "text", requestMessageId: `user-${index}`, turnTerminal: true, turnSucceeded: true, text: index === 1 ? "研究结果" : "最终结论" }] };
    });
    const result = await runWorkflow(steps, { signal: new AbortController().signal, onChange: () => {}, request: request as never });
    expect(sent).toHaveLength(2);
    expect(sent[1].path).toBe("/api/bots/bot-b/messages");
    expect(sent[1].text).toContain("研究结果");
    expect(result.steps.map((step) => step.stage)).toEqual(["done", "done"]);
    expect(result.steps[1].output).toBe("最终结论");
  });

  it("stops after a failed step", async () => {
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === "POST"
      ? { threadId: "thread-1", message: { id: "user-1" } }
      : { messages: [{ id: "bot-1", role: "bot", kind: "text", requestMessageId: "user-1", turnTerminal: true, turnSucceeded: false, text: "执行失败" }] });
    const result = await runWorkflow(steps, { signal: new AbortController().signal, onChange: () => {}, request: request as never });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.steps[0]).toMatchObject({ stage: "failed", error: "执行失败" });
    expect(result.steps[1].stage).toBe("waiting");
  });

  it("rejects missing assistants and empty prompts before sending", () => {
    expect(validateWorkflowSteps([], new Set())).toMatch(/添加/);
    expect(validateWorkflowSteps(steps, new Set(["bot-a"]))).toMatch(/助手/);
    expect(validateWorkflowSteps([{ ...steps[0], prompt: " " }], new Set(["bot-a"]))).toMatch(/任务/);
  });
});

describe("workflow graph runner", () => {
  const graph: WorkflowGraph = {
    title: "分支工作流",
    nodes: [
      { id: "t", kind: "trigger", title: "触发", x: 0, y: 0 },
      { id: "p", kind: "prompt", title: "整理", text: "资料：{{input}}", x: 1, y: 0 },
      { id: "c", kind: "condition", title: "检查", rule: "包含：通过", x: 2, y: 0 },
      { id: "yes", kind: "output", title: "通过", x: 3, y: 0 },
      { id: "no", kind: "output", title: "退回", x: 3, y: 1 },
    ],
    edges: [
      { id: "1", from: "t", to: "p" },
      { id: "2", from: "p", to: "c" },
      { id: "3", from: "c", to: "yes", branch: "yes" },
      { id: "4", from: "c", to: "no", branch: "no" },
    ],
  };

  it("executes only the matching condition branch", async () => {
    const result = await runWorkflowGraph(graph, { input: "检查通过", signal: new AbortController().signal, approve: async () => true, onChange: () => undefined });
    expect(result.status).toBe("done");
    expect(result.nodes.find((node) => node.id === "yes")?.stage).toBe("done");
    expect(result.nodes.find((node) => node.id === "no")?.stage).toBe("waiting");
  });

  it("pauses for approval and stops when rejected", async () => {
    const approvalGraph: WorkflowGraph = {
      title: "审批",
      nodes: [{ id: "t", kind: "trigger", title: "触发", x: 0, y: 0 }, { id: "a", kind: "approval", title: "审批", x: 1, y: 0 }],
      edges: [{ id: "1", from: "t", to: "a" }],
    };
    const result = await runWorkflowGraph(approvalGraph, { signal: new AbortController().signal, approve: async () => false, onChange: () => undefined });
    expect(result.status).toBe("failed");
    expect(result.nodes.find((node) => node.id === "a")?.error).toContain("拒绝");
  });

  it("rejects condition edges without a branch", () => {
    const broken = structuredClone(graph);
    delete broken.edges[2].branch;
    expect(validateWorkflowGraph(broken, new Set())).toContain("必须选择");
  });
});

describe("parallel fan-out and join", () => {
  const node = (id: string, kind: WorkflowNode["kind"], title: string, patch: Partial<WorkflowNode> = {}): WorkflowNode =>
    ({ id, kind, title, x: 0, y: 0, ...patch });
  const parallelGraph: WorkflowGraph = {
    title: "并行",
    nodes: [
      node("t", "trigger", "触发"), node("p", "parallel", "并行分叉"),
      node("a", "agent", "A", { botId: "bot-a", text: "做A {{input}}" }),
      node("b", "agent", "B", { botId: "bot-b", text: "做B {{input}}" }),
      node("j", "join", "汇合"), node("o", "output", "输出"),
    ],
    edges: [
      { id: "1", from: "t", to: "p" }, { id: "2", from: "p", to: "a" }, { id: "3", from: "p", to: "b" },
      { id: "4", from: "a", to: "j" }, { id: "5", from: "b", to: "j" }, { id: "6", from: "j", to: "o" },
    ],
  };

  const fakeRequest = () => vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const botId = /\/api\/bots\/([\w-]+)\/messages/.exec(path)![1]!;
      return { threadId: `t-${botId}`, message: { id: `u-${botId}` } };
    }
    const botId = /\/api\/threads\/t-([\w-]+)\/messages/.exec(path)![1]!;
    return { messages: [{ id: `b-${botId}`, role: "bot", kind: "text", requestMessageId: `u-${botId}`, turnTerminal: true, turnSucceeded: true, text: `结果-${botId}` }] };
  });

  it("requires two outgoing branches on a parallel node and two inputs on a join", () => {
    expect(validateWorkflowGraph(parallelGraph, new Set(["bot-a", "bot-b"]))).toBeNull();
    const oneBranch = structuredClone(parallelGraph);
    oneBranch.edges = oneBranch.edges.filter((edge) => edge.id !== "3");
    expect(validateWorkflowGraph(oneBranch, new Set(["bot-a", "bot-b"]))).toContain("两个分支");
    const oneInput = structuredClone(parallelGraph);
    oneInput.edges = oneInput.edges.filter((edge) => edge.id !== "5");
    expect(validateWorkflowGraph(oneInput, new Set(["bot-a", "bot-b"]))).toContain("两个输入分支");
  });

  it("runs both branches and merges their results at the join", async () => {
    const request = fakeRequest();
    const result = await runWorkflowGraph(parallelGraph, {
      input: "原始输入", signal: new AbortController().signal, approve: async () => true,
      onChange: () => undefined, request: request as never,
    });
    expect(result.status).toBe("done");
    expect(result.nodes.find((entry) => entry.id === "a")?.stage).toBe("done");
    expect(result.nodes.find((entry) => entry.id === "b")?.stage).toBe("done");
    expect(request).toHaveBeenCalledTimes(4); // two sends + two polls
    const joined = result.nodes.find((entry) => entry.id === "j")?.output ?? "";
    expect(joined).toContain("结果-bot-a");
    expect(joined).toContain("结果-bot-b");
    expect(result.nodes.find((entry) => entry.id === "o")?.output).toBe(joined);
  });

  it("does not deadlock when a condition skips one branch into a join", async () => {
    const conditional: WorkflowGraph = {
      title: "条件汇合",
      nodes: [
        node("t", "trigger", "触发"), node("c", "condition", "判断", { rule: "包含：yes" }),
        node("y", "output", "是"), node("n", "output", "否"), node("j", "join", "汇合"), node("o", "output", "输出"),
      ],
      edges: [
        { id: "1", from: "t", to: "c" }, { id: "2", from: "c", to: "y", branch: "yes" },
        { id: "3", from: "c", to: "n", branch: "no" }, { id: "4", from: "y", to: "j" },
        { id: "5", from: "n", to: "j" }, { id: "6", from: "j", to: "o" },
      ],
    };
    const result = await runWorkflowGraph(conditional, {
      input: "yes", signal: new AbortController().signal, approve: async () => true, onChange: () => undefined,
      request: (async () => ({ messages: [] })) as never,
    });
    expect(result.status).toBe("done");
    expect(result.nodes.find((entry) => entry.id === "j")?.stage).toBe("done");
    expect(result.nodes.find((entry) => entry.id === "o")?.stage).toBe("done");
  });
});
