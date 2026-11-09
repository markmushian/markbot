import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripVertical, Maximize2, Minimize2, RotateCcw, EyeOff, Eye } from "lucide-react";
import { cn } from "@/lib/cn";
import { SlotRegistry, type RegisteredWidget } from "@/lib/slots";
import {
  movePanel, panelOrder, readLayout, resetLayout, setPanelWidth, togglePanel,
  writeLayout, type WorkspaceLayout,
} from "@/lib/workspace-layout";

/** The draggable multi-panel cockpit. Panels come from the Slot registry;
 * their order/visibility/width is stored per project, not per session. */
export function CockpitWorkspace({ projectKey, registry, renderWidget }: {
  projectKey: string;
  registry: SlotRegistry;
  renderWidget: (widget: RegisteredWidget) => ReactNode;
}) {
  const widgets = registry.list("cockpit");
  const ids = widgets.map((widget) => widget.id);
  const [layout, setLayout] = useState<WorkspaceLayout>(() => readLayout(projectKey, ids));
  const [dragging, setDragging] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => { setLayout(readLayout(projectKey, ids)); }, [projectKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (next: WorkspaceLayout) => { setLayout(next); writeLayout(projectKey, next); };
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const visible = panelOrder(layout).filter((id) => byId.has(id));
  const hidden = widgets.filter((widget) => layout[widget.id] && !layout[widget.id]!.visible);

  const drop = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const source = event.dataTransfer.getData("text/plain") || dragging;
    if (source && source !== targetId) persist(movePanel(layout, source, targetId));
    setDragging(null);
  };

  return (
    <div data-cockpit-workspace className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-hairline/40 bg-card px-3 py-2">
        <span className="text-meta leading-relaxed text-ink-secondary">拖动面板标题栏排序 · 布局按项目单独保存</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setShowHidden((value) => !value)} aria-pressed={showHidden}
            className="inline-flex items-center gap-1 rounded-lg bg-control px-2 py-1 text-meta text-ink-secondary hover:text-ink">
            {showHidden ? <Eye size={12} /> : <EyeOff size={12} />} 隐藏面板 {hidden.length}
          </button>
          <button type="button" onClick={() => persist(resetLayout(projectKey, ids))}
            className="inline-flex items-center gap-1 rounded-lg bg-control px-2 py-1 text-meta text-ink-secondary hover:text-ink">
            <RotateCcw size={12} /> 重置布局
          </button>
        </div>
      </div>

      {showHidden && hidden.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5 rounded-2xl border border-dashed border-hairline/50 bg-app/50 p-2.5">
          {hidden.map((widget) => (
            <button key={widget.id} type="button" onClick={() => persist(togglePanel(layout, widget.id, "visible"))}
              className="rounded-lg bg-card px-2 py-1 text-meta text-ink-secondary hover:text-ink">
              + {widget.title}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {visible.map((id) => {
          const widget = byId.get(id)!;
          const panel = layout[id]!;
          return (
            <section key={id} data-cockpit-panel={id}
              onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, id)}
              className={cn("min-w-0 rounded-3xl border border-hairline/50 bg-card shadow-sm", panel.width === 1 && "lg:col-span-2", dragging && "border-accent/30")}>
              <header draggable
                onDragStart={(event) => { event.dataTransfer.setData("text/plain", id); setDragging(id); }}
                onDragEnd={() => setDragging(null)}
                className="flex cursor-grab items-center gap-2 border-b border-hairline/40 px-3.5 py-2.5 active:cursor-grabbing">
                <GripVertical size={14} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
                <strong className="min-w-0 flex-1 truncate text-note font-semibold text-ink">{widget.title}</strong>
                <span className="shrink-0 rounded bg-control px-1.5 py-0.5 text-micro text-ink-tertiary">{widget.builtin ? "内置" : "插件"}</span>
                <button type="button" onClick={() => persist(setPanelWidth(layout, id, panel.width === 1 ? 0.5 : 1))}
                  aria-label={panel.width === 1 ? "改为半宽" : "改为全宽"} title={panel.width === 1 ? "改为半宽" : "改为全宽"}
                  className="rounded p-1 text-ink-tertiary hover:bg-control hover:text-ink">
                  {panel.width === 1 ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                </button>
                <button type="button" onClick={() => persist(togglePanel(layout, id, "collapsed"))}
                  aria-label={panel.collapsed ? "展开" : "折叠"} title={panel.collapsed ? "展开" : "折叠"}
                  className="rounded p-1 text-ink-tertiary hover:bg-control hover:text-ink">
                  {panel.collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                </button>
                <button type="button" onClick={() => persist(togglePanel(layout, id, "visible"))}
                  aria-label="隐藏面板" title="隐藏面板" className="rounded p-1 text-ink-tertiary hover:bg-control hover:text-ink"><EyeOff size={13} /></button>
              </header>
              {!panel.collapsed && (
                <div className="p-3.5">
                  {widget.available
                    ? renderWidget(widget)
                    : <p className="rounded-xl bg-warning/10 px-3 py-2 text-meta leading-relaxed text-warning">{widget.reason}</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
