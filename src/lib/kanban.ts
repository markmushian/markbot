import type { CockpitTask, CockpitTaskState } from "./cockpit";

export type KanbanColumn = "todo" | "in-progress" | "done" | "blocked";

/** Map the cockpit's activity states onto the four board columns. */
export function kanbanColumn(state: CockpitTaskState): KanbanColumn {
  switch (state) {
    case "running": return "in-progress";
    case "done": return "done";
    case "review": return "blocked";
    default: return "todo";
  }
}

export function taskKey(task: CockpitTask): string {
  return `${task.bot.id}:${task.task.threadId}`;
}

export const KANBAN_COLUMN_IDS: readonly KanbanColumn[] = ["todo", "in-progress", "done", "blocked"];
