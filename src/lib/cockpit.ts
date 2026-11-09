import type { Bot, Task } from "@/state/store";

export type CockpitTaskState = "needs-you" | "running" | "review" | "done";

export interface CockpitTask {
  bot: Bot;
  task: Task;
  state: CockpitTaskState;
  updatedAt: number;
}

export interface CockpitProject {
  key: string;
  name: string;
  lead?: Bot;
  members: Bot[];
  tasks: CockpitTask[];
  state: "needs-you" | "running" | "idle";
}

function taskState(bot: Bot, task: Task): CockpitTaskState {
  const activity = task.activity ?? (task.threadId === bot.threadId ? bot.activity : undefined);
  if (activity === "waiting-on-you" || (task.openAsks ?? 0) > 0) return "needs-you";
  if (task.waitingForTeammates) return "review";
  if (task.busy || activity === "working") return "running";
  return "done";
}

function taskTime(task: Task): number {
  return task.updatedAt ?? task.lastThreadOrderAt ?? task.createdAt;
}

export function cockpitProjects(bots: readonly Bot[]): CockpitProject[] {
  const sections = new Map<string, Bot[]>();
  for (const bot of bots.filter((candidate) => !candidate.hidden)) {
    const name = bot.section?.trim() || "未分组团队";
    sections.set(name, [...(sections.get(name) ?? []), bot]);
  }

  return [...sections.entries()].map(([name, members]) => {
    const tasks = members.flatMap((bot) => (bot.tasks ?? []).filter((task) => !task.archivedAt).map((task) => ({
      bot,
      task,
      state: taskState(bot, task),
      updatedAt: taskTime(task),
    }))).sort((a, b) => b.updatedAt - a.updatedAt);
    const lead = members.find((bot) => bot.chiefOfStaff) ?? members.find((bot) => !bot.reportsTo);
    const state = tasks.some((task) => task.state === "needs-you")
      ? "needs-you" as const
      : tasks.some((task) => task.state === "running" || task.state === "review")
        ? "running" as const
        : "idle" as const;
    return { key: name, name, lead, members, tasks, state };
  }).sort((a, b) => {
    const rank = { "needs-you": 0, running: 1, idle: 2 };
    return rank[a.state] - rank[b.state] || a.name.localeCompare(b.name, "zh-CN");
  });
}

export function cockpitCounts(projects: readonly CockpitProject[]) {
  const tasks = projects.flatMap((project) => project.tasks);
  return {
    projects: projects.length,
    agents: projects.reduce((sum, project) => sum + project.members.length, 0),
    running: tasks.filter((task) => task.state === "running" || task.state === "review").length,
    needsYou: tasks.filter((task) => task.state === "needs-you").length,
  };
}
