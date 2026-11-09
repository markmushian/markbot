import { describe, expect, it } from "vitest";
import { cockpitCounts, cockpitProjects } from "./cockpit";

const bot = (id: string, section: string, activity?: string, chiefOfStaff = false) => ({
  id, section, chiefOfStaff, hidden: false, activity,
  threadId: `${id}-main`, name: id, title: "", description: "", notifications: true, color: "blue",
  unread: false, modelSelection: { instanceId: "codex", model: "auto" }, messages: [],
  tasks: [{ threadId: `${id}-main`, title: `${id} task`, createdAt: 1, activity }],
} as never);

describe("cockpit projects", () => {
  it("groups agents under a project and prefers the chief as lead", () => {
    const projects = cockpitProjects([bot("worker", "Launch"), bot("mark", "Launch", "working", true)]);
    expect(projects).toHaveLength(1);
    expect(projects[0].lead?.id).toBe("mark");
    expect(projects[0].state).toBe("running");
  });

  it("prioritizes projects waiting on the user", () => {
    const projects = cockpitProjects([bot("worker", "Build", "working"), bot("review", "Review", "waiting-on-you")]);
    expect(projects.map((project) => project.name)).toEqual(["Review", "Build"]);
    expect(cockpitCounts(projects)).toMatchObject({ projects: 2, agents: 2, running: 1, needsYou: 1 });
  });
});
