import { describe, expect, it } from "vitest";
import { workflowFromGoal } from "./workflow-architect";
import { validateWorkflowGraph } from "./workflow-runner";

describe("workflow architect", () => {
  it("creates a chief-led execution and review loop", () => {
    const graph = workflowFromGoal("完成功能并测试验收", [
      { id: "mark", name: "Mark", chiefOfStaff: true },
      { id: "dev", name: "开发" },
      { id: "qa", name: "QA", title: "质量审核" },
    ]);
    expect(graph.nodes.some((node) => node.kind === "condition")).toBe(true);
    expect(graph.edges.some((edge) => edge.branch === "no")).toBe(true);
    expect(graph.nodes.find((node) => node.title.includes("QA"))?.botId).toBe("qa");
    expect(validateWorkflowGraph(graph, new Set(["mark", "dev", "qa"]))).toBeNull();
  });

  it("adds human approval for risky delivery goals", () => {
    const graph = workflowFromGoal("检查后发布上线", [{ id: "mark", name: "Mark", chiefOfStaff: true }]);
    expect(graph.nodes.some((node) => node.kind === "approval")).toBe(true);
    expect(validateWorkflowGraph(graph, new Set(["mark"]))).toBeNull();
  });
});
