import { describe, expect, it } from "vitest";
import type { CockpitTask } from "./cockpit";

import { KANBAN_COLUMN_IDS, kanbanColumn, taskKey } from "./kanban.ts";

describe("kanban columns", () => {
  it("maps every cockpit state onto one of exactly four columns", () => {
    expect(kanbanColumn("needs-you")).toBe("todo");
    expect(kanbanColumn("running")).toBe("in-progress");
    expect(kanbanColumn("review")).toBe("blocked");
    expect(kanbanColumn("done")).toBe("done");
    expect(KANBAN_COLUMN_IDS).toEqual(["todo", "in-progress", "done", "blocked"]);
  });

  it("uses a stable per-bot, per-thread key for drag and drop", () => {
    const task = { bot: { id: "bot-1" }, task: { threadId: "thread-9" } } as CockpitTask;
    expect(taskKey(task)).toBe("bot-1:thread-9");
    expect(taskKey({ ...task, bot: { id: "bot-2" } } as CockpitTask)).not.toBe(taskKey(task));
  });
});
