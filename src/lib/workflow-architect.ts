import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "./workflow-runner";

export interface WorkflowArchitectAgent {
  id: string;
  name: string;
  chiefOfStaff?: boolean;
  title?: string;
}

function node(kind: WorkflowNode["kind"], title: string, x: number, y: number, patch: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id: crypto.randomUUID(), kind, title, x, y, ...patch };
}

export function workflowFromGoal(goal: string, agents: readonly WorkflowArchitectAgent[]): WorkflowGraph {
  const chief = agents.find((agent) => agent.chiefOfStaff) ?? agents[0];
  const workers = agents.filter((agent) => agent.id !== chief?.id);
  const reviewer = workers.find((agent) => /审核|测试|review|qa/i.test(`${agent.name} ${agent.title ?? ""}`)) ?? workers[1] ?? workers[0] ?? chief;
  const executor = workers.find((agent) => agent.id !== reviewer?.id) ?? workers[0] ?? chief;
  const wantsApproval = /审批|确认|发布|上线|删除|付款|approve|publish|deploy/i.test(goal);
  const wantsReview = /审核|检查|测试|验收|质量|review|test|verify/i.test(goal) || Boolean(reviewer);
  const nodes: WorkflowNode[] = [node("trigger", "手动启动", 100, 300)];
  nodes.push(node("prompt", "总监拆解目标", 430, 300, { text: `你是项目总监。请将下列目标拆解为可执行步骤，列出交付标准和风险：\n\n${goal || "{{input}}"}` }));
  if (executor) nodes.push(node("agent", `${executor.name}执行`, 760, 220, { botId: executor.id, text: "根据总监的计划完成任务，必须提供可验收的产物和执行记录。\n\n{{input}}" }));
  if (wantsReview && reviewer) nodes.push(node("agent", `${reviewer.name}独立审核`, 1090, 220, { botId: reviewer.id, text: "你是独立审核员。检查完整性、正确性和风险，明确输出“通过”或“不通过”及理由。\n\n{{input}}" }));
  if (wantsReview) nodes.push(node("condition", "审核是否通过", 1420, 220, { rule: "包含：通过" }));
  if (wantsApproval) nodes.push(node("approval", "用户最终审批", 1750, 120));
  nodes.push(node("agent", `${chief?.name ?? "总监"}汇总交付`, wantsApproval ? 2080 : wantsReview ? 1750 : 1090, 120, { botId: chief?.id, text: "汇总实际执行结果、验证证据、已知风险和后续建议，给用户一份可直接验收的报告。\n\n{{input}}" }));
  nodes.push(node("output", "交付最终结果", nodes.at(-1)!.x + 330, 120));

  const edges: WorkflowEdge[] = nodes.slice(1).map((current, index) => ({
    id: crypto.randomUUID(), from: nodes[index].id, to: current.id,
    ...(nodes[index].kind === "condition" ? { branch: "yes" as const } : {}),
  }));
  if (wantsReview) {
    const condition = nodes.find((entry) => entry.kind === "condition");
    const rejected = node("output", "审核未通过，退回总监", condition?.x ? condition.x + 330 : 1750, 430);
    nodes.push(rejected);
    if (condition) edges.push({ id: crypto.randomUUID(), from: condition.id, to: rejected.id, branch: "no" });
  }
  return { title: goal.trim().slice(0, 32) || "AI 生成工作流", nodes, edges };
}
