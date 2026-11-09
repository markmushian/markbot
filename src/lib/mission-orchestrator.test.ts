import { describe, expect, it } from "vitest";

import {
  chiefPlanningPrompt, missionTrace, missionWaves, parseMissionPlan, reviewVerdict,
  runMission, validateMissionPlan, type MissionPlan,
} from "./mission-orchestrator.ts";

const AGENTS = [
  { id: "chief", name: "总监" },
  { id: "coder", name: "工程师" },
  { id: "writer", name: "文档" },
  { id: "qa", name: "审核" },
];

const PLAN: MissionPlan = {
  goal: "上线一个新功能",
  subtasks: [
    { id: "s1", title: "写实现", assigneeId: "coder", instruction: "实现功能" },
    { id: "s2", title: "写文档", assigneeId: "writer", instruction: "补文档" },
    { id: "s3", title: "汇总", assigneeId: "coder", instruction: "合并两者", dependsOn: ["s1", "s2"] },
  ],
};

interface FakeServer {
  request: <T>(path: string, init?: { method?: string; body?: string; signal?: AbortSignal }) => Promise<T>;
  createdTasks: string[];
  sent: Array<{ botId: string; text: string; threadId?: string }>;
  verdicts: string[];
}

function fakeServer(options: { planText?: string; failSubtask?: string } = {}): FakeServer {
  const createdTasks: string[] = [];
  const sent: Array<{ botId: string; text: string; threadId?: string }> = [];
  const verdicts: string[] = [];
  const pending = new Map<string, string>();
  let seq = 0;
  const planText = options.planText ?? `<mission-plan>${JSON.stringify(PLAN)}</mission-plan>`;
  const request = async <T,>(path: string, init?: { method?: string; body?: string; signal?: AbortSignal }): Promise<T> => {
    const body = init?.body ? JSON.parse(init.body) as Record<string, unknown> : {};
    if (/^\/api\/bots\/([\w-]+)\/tasks$/.test(path)) {
      const botId = /^\/api\/bots\/([\w-]+)\/tasks$/.exec(path)![1]!;
      const threadId = `task-${botId}-${++seq}`;
      createdTasks.push(`${botId}:${String(body.title)}`);
      return { task: { threadId } } as T;
    }
    if (/^\/api\/bots\/([\w-]+)\/messages$/.test(path)) {
      const botId = /^\/api\/bots\/([\w-]+)\/messages$/.exec(path)![1]!;
      const userText = String(body.text ?? "");
      sent.push({ botId, text: userText, threadId: body.threadId ? String(body.threadId) : undefined });
      const threadId = body.threadId ? String(body.threadId) : `thread-${++seq}`;
      const messageId = `msg-${++seq}`;
      let answer = `【${botId} 的交付】已完成`;
      if (userText.includes("把下面的目标拆成")) answer = planText;
      else if (userText.includes("以下是各子任务的真实执行结果")) answer = "总监汇总报告：全部交付完成";
      else if (userText.includes("你是独立审核员")) {
        answer = verdicts.shift() ?? "结论：通过\n所有交付合格。";
      } else if (/^第 \d+ 次返工/.test(userText)) answer = "返工后的完整产物";
      else if (options.failSubtask && userText.includes(options.failSubtask)) {
        pending.set(`${threadId}:${messageId}`, "__FAIL__");
        return { threadId, message: { id: messageId } } as T;
      }
      pending.set(`${threadId}:${messageId}`, answer);
      return { threadId, message: { id: messageId } } as T;
    }
    if (/^\/api\/threads\/([\w-]+)\/messages/.test(path)) {
      const threadId = /^\/api\/threads\/([\w-]+)\/messages/.exec(path)![1]!;
      for (const [key, answer] of pending) {
        if (!key.startsWith(`${threadId}:`)) continue;
        const messageId = key.slice(threadId.length + 1);
        pending.delete(key);
        const failed = answer === "__FAIL__";
        return { messages: [{ id: `bot-${messageId}`, role: "bot", kind: "text", requestMessageId: messageId, turnTerminal: true, turnSucceeded: !failed, text: failed ? "执行失败" : answer }] } as T;
      }
      return { messages: [] } as T;
    }
    throw new Error(`Unexpected path: ${path}`);
  };
  return { request, createdTasks, sent, verdicts };
}

describe("chief splits a goal into real subtasks", () => {
  it("parses a control-envelope plan and tolerates prose around it", () => {
    const parsed = parseMissionPlan(`这是拆分结果：\n<mission-plan>${JSON.stringify(PLAN)}</mission-plan>\n谢谢`, "fallback");
    expect(parsed?.subtasks).toHaveLength(3);
    expect(parsed?.subtasks[2].dependsOn).toEqual(["s1", "s2"]);
    expect(parseMissionPlan("没有 JSON")).toBeNull();
    expect(parseMissionPlan('<mission-plan>{"subtasks":[]}</mission-plan>')).toBeNull();
  });

  it("validates assignees, duplicates and dependencies", () => {
    const ids = new Set(AGENTS.map((agent) => agent.id));
    expect(validateMissionPlan(PLAN, ids)).toBeNull();
    expect(validateMissionPlan({ ...PLAN, subtasks: [{ ...PLAN.subtasks[0]!, assigneeId: "ghost" }] }, ids)).toContain("不存在");
    expect(validateMissionPlan({ ...PLAN, subtasks: [...PLAN.subtasks, PLAN.subtasks[0]!] }, ids)).toContain("重复");
    expect(validateMissionPlan({ ...PLAN, subtasks: [{ ...PLAN.subtasks[0]!, dependsOn: ["nope"] }] }, ids)).toContain("依赖");
  });

  it("schedules independent work in one parallel wave, dependents later", () => {
    const waves = missionWaves(PLAN.subtasks);
    expect(waves).toHaveLength(2);
    expect(waves[0].map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(waves[1].map((item) => item.id)).toEqual(["s3"]);
    // A cycle must not deadlock the mission.
    expect(missionWaves([{ id: "a", title: "a", assigneeId: "x", instruction: "a", dependsOn: ["b"] },
      { id: "b", title: "b", assigneeId: "x", instruction: "b", dependsOn: ["a"] }])).toHaveLength(1);
  });

  it("asks the chief for a structured plan", () => {
    const prompt = chiefPlanningPrompt("上线新功能", AGENTS.slice(1));
    expect(prompt).toContain("coder");
    expect(prompt).toContain("mission-plan");
  });

  it("reads an explicit review verdict", () => {
    expect(reviewVerdict("检查完毕\n结论：通过").passed).toBe(true);
    expect(reviewVerdict("有问题，需要补充\n结论：不通过").passed).toBe(false);
    expect(reviewVerdict("验收通过，全部合格").passed).toBe(true);
    expect(reviewVerdict("存在不足，需要修改").passed).toBe(false);
  });

  it("creates real task cards, reports back to the chief and finishes", async () => {
    const server = fakeServer({ planText: `<mission-plan>${JSON.stringify(PLAN)}</mission-plan>` });
    const states: Array<{ status: string; timeline: number }> = [];
    const result = await runMission({
      goal: "上线一个新功能", chiefId: "chief", agents: AGENTS, signal: new AbortController().signal,
      request: server.request, onChange: (state) => states.push({ status: state.status, timeline: state.timeline.length }),
    });
    expect(result.status).toBe("done");
    expect(result.subtasks).toHaveLength(3);
    expect(result.subtasks.every((item) => item.status === "done")).toBe(true);
    // One real task card per subtask, not one message in the chief's thread.
    expect(server.createdTasks).toEqual(["coder:写实现", "writer:写文档", "coder:汇总"]);
    expect(result.report).toContain("汇总报告");
    expect(server.sent.some((item) => item.botId === "chief" && item.text.includes("以下是各子任务的真实执行结果"))).toBe(true);
    expect(result.timeline.map((item) => item.kind)).toContain("reported");
    expect(missionTrace(result)).toContain("协作任务完成");
    expect(states.at(-1)?.status).toBe("done");
  });

  it("automatically reworks rejected work and then passes", async () => {
    const server = fakeServer();
    server.verdicts.push("缺少测试\n结论：不通过", "结论：通过\n返工后合格");
    const result = await runMission({
      goal: "上线一个新功能", chiefId: "chief", agents: AGENTS, reviewerId: "qa",
      signal: new AbortController().signal, request: server.request, onChange: () => {}, plan: PLAN,
    });
    expect(result.reworks).toBe(1);
    expect(result.status).toBe("done");
    expect(result.timeline.map((item) => item.kind)).toContain("rework");
    expect(server.sent.some((item) => item.text.startsWith("第 1 次返工"))).toBe(true);
  });

  it("stops after the rework budget is exhausted instead of looping forever", async () => {
    const server = fakeServer();
    for (let i = 0; i < 5; i++) server.verdicts.push("还是不通过\n结论：不通过");
    const result = await runMission({
      goal: "上线一个新功能", chiefId: "chief", agents: AGENTS, reviewerId: "qa", maxReworks: 1,
      signal: new AbortController().signal, request: server.request, onChange: () => {}, plan: PLAN,
    });
    expect(result.status).toBe("failed");
    expect(result.reworks).toBe(1);
    expect(result.error).toContain("返工次数");
  });

  it("keeps a failed subtask in the timeline instead of silently dropping it", async () => {
    const server = fakeServer({ failSubtask: "实现功能" });
    const result = await runMission({
      goal: "上线一个新功能", chiefId: "chief", agents: AGENTS,
      signal: new AbortController().signal, request: server.request, onChange: () => {}, plan: PLAN,
    });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("执行失败");
    expect(result.timeline.some((item) => item.kind === "failed")).toBe(true);
  });
});
