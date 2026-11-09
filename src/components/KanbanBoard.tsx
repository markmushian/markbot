import { useState, type DragEvent } from "react";
import { CircleSlash, Clock3, ListTodo, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CockpitProject, CockpitTask } from "@/lib/cockpit";
import { kanbanColumn, taskKey, type KanbanColumn } from "@/lib/kanban";

export { kanbanColumn, taskKey } from "@/lib/kanban";

export const KANBAN_COLUMNS: ReadonlyArray<{ id: KanbanColumn; label: string; icon: typeof ListTodo; tone: string }> = [
  { id: "todo", label: "待办", icon: ListTodo, tone: "text-ink-secondary bg-control" },
  { id: "in-progress", label: "执行中", icon: Loader2, tone: "text-accent bg-accent/10" },
  { id: "done", label: "已完成", icon: CheckCircle2, tone: "text-success bg-success/10" },
  { id: "blocked", label: "待审核", icon: CircleSlash, tone: "text-warning bg-warning/10" },
];

export function KanbanBoard({ projects, onOpenTask }: {
  projects: readonly CockpitProject[];
  onOpenTask?: (task: CockpitTask) => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, KanbanColumn>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const tasks = projects.flatMap((project) => project.tasks.map((task) => ({ task, project: project.name })));

  const drop = (event: DragEvent<HTMLElement>, column: KanbanColumn) => {
    event.preventDefault();
    const key = event.dataTransfer.getData("text/plain") || dragging;
    if (key) setOverrides((current) => ({ ...current, [key]: column }));
    setDragging(null);
  };

  return (
    <div data-kanban-board className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-meta text-ink-secondary">四列看板 · 可拖动卡片调整分组（仅本地视图，不改变 Agent 实际状态）</span>
        {Object.keys(overrides).length > 0 && (
          <button type="button" onClick={() => setOverrides({})} className="text-meta text-accent-text hover:underline">还原分组</button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {KANBAN_COLUMNS.map((column) => {
          const Icon = column.icon;
          const rows = tasks.filter(({ task }) => (overrides[taskKey(task)] ?? kanbanColumn(task.state)) === column.id);
          return (
            <section key={column.id} data-kanban-column={column.id}
              onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, column.id)}
              className={cn("flex min-h-[180px] min-w-0 flex-col rounded-2xl border border-hairline/40 bg-app/50 p-2.5", dragging && "border-accent/40")}>
              <header className="mb-2 flex items-center gap-2">
                <span className={cn("flex size-6 items-center justify-center rounded-lg", column.tone)}><Icon size={13} aria-hidden="true" /></span>
                <strong className="min-w-0 flex-1 truncate text-meta font-semibold text-ink">{column.label}</strong>
                <span className="shrink-0 rounded-[4px] bg-control px-1.5 text-tiny tabular-nums text-ink-secondary">{rows.length}</span>
              </header>
              <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
                {rows.map(({ task, project }) => (
                  <li key={taskKey(task)} draggable
                    onDragStart={(event) => { const key = taskKey(task); event.dataTransfer.setData("text/plain", key); setDragging(key); }}
                    onDragEnd={() => setDragging(null)}
                    className={cn("cursor-grab rounded-xl border border-hairline/40 bg-card p-2.5 active:cursor-grabbing", dragging === taskKey(task) && "opacity-50")}>
                    <button type="button" onClick={() => onOpenTask?.(task)} className="block w-full text-left">
                      <span className="block truncate text-note font-medium text-ink" title={task.task.title}>{task.task.title || "未命名任务"}</span>
                      <span className="mt-1 block truncate text-tiny text-ink-tertiary">{task.bot.name} · {project}</span>
                      <span className="mt-1.5 flex items-center gap-1.5 text-tiny text-ink-tertiary">
                        <Clock3 size={10} aria-hidden="true" />
                        {new Date(task.updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                        <span className="truncate">{task.task.modelSelection?.model ?? task.bot.modelSelection.model}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {rows.length === 0 && <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-hairline/40 py-4 text-tiny text-ink-tertiary">拖卡片到这里</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
