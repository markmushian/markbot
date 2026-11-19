/** A tiny Slot host, in the spirit of Timon's SlotKeyed: product features and
 * third-party widgets register into the same named places, and the shell just
 * renders whatever is registered. A widget that needs a capability the current
 * surface does not have stays visible-but-disabled rather than disappearing.
 */
import { SURFACE_CAPABILITIES, type ClientSurface, type RuntimeCapabilities } from "../../shared/runtime-codes.ts";

export type SlotKey = "cockpit" | "sidebar" | "topbar" | "kanban" | "settings" | "composer" | "inspector";

export const SLOT_KEYS: readonly SlotKey[] = ["cockpit", "sidebar", "topbar", "kanban", "settings", "composer", "inspector"];

export interface WidgetDefinition {
  id: string;
  slot: SlotKey;
  title: string;
  order: number;
  /** Capability needed to render; absent means always available. */
  capability?: keyof RuntimeCapabilities;
  builtin?: boolean;
}

export interface RegisteredWidget extends WidgetDefinition {
  /** False when the current surface cannot run it. Still shown, with a reason. */
  available: boolean;
  reason?: string;
}

/** Stable key for a slot+widget pair, so a plugin never collides with a builtin. */
export function slotKey(slot: SlotKey, id: string): string {
  return `${slot}:${id}`;
}

export function isSlotKey(value: unknown): value is SlotKey {
  return typeof value === "string" && (SLOT_KEYS as readonly string[]).includes(value);
}

export class SlotRegistry {
  private readonly widgets = new Map<string, WidgetDefinition>();

  constructor(initial: readonly WidgetDefinition[] = []) {
    for (const widget of initial) this.register(widget);
  }

  register(widget: WidgetDefinition): void {
    if (!isSlotKey(widget.slot)) throw new Error(`Unknown slot: ${widget.slot}`);
    this.widgets.set(slotKey(widget.slot, widget.id), widget);
  }

  unregister(slot: SlotKey, id: string): boolean {
    return this.widgets.delete(slotKey(slot, id));
  }

  /** Sorted by order; one registry can be shared by desktop, web and phone. */
  list(slot: SlotKey, surface: ClientSurface = "desktop"): RegisteredWidget[] {
    const caps = SURFACE_CAPABILITIES[surface];
    return [...this.widgets.values()]
      .filter((widget) => widget.slot === slot)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((widget) => {
        const needs = widget.capability;
        const value = needs ? caps[needs] : true;
        const available = !needs || (needs !== "surface" && value === true);
        return { ...widget, available, ...(available ? {} : { reason: `当前客户端（${surface}）不支持：${String(needs)}` }) };
      });
  }

  all(): WidgetDefinition[] {
    return [...this.widgets.values()];
  }
}

/** Built-ins use the very same registry a plugin would use. */
export const BUILTIN_WIDGETS: readonly WidgetDefinition[] = [
  { id: "director", slot: "cockpit", title: "总监指令台", order: 10, builtin: true },
  { id: "mission", slot: "cockpit", title: "总监协作任务", order: 20, capability: "taskDelegation", builtin: true },
  { id: "kanban", slot: "cockpit", title: "任务看板", order: 30, capability: "kanban", builtin: true },
  { id: "stats", slot: "cockpit", title: "状态统计", order: 40, builtin: true },
  { id: "devices", slot: "cockpit", title: "跨设备工作台", order: 50, capability: "phonePairing", builtin: true },
  { id: "providers", slot: "cockpit", title: "引擎状态", order: 60, capability: "providerCli", builtin: true },
  { id: "kanban-column", slot: "kanban", title: "看板列", order: 10, capability: "kanban", builtin: true },
  { id: "context-ring", slot: "composer", title: "上下文用量环", order: 10, builtin: true },
  { id: "terminal", slot: "inspector", title: "交互式终端", order: 10, capability: "interactiveTerminal", builtin: true },
];

export function createDefaultRegistry(): SlotRegistry {
  return new SlotRegistry(BUILTIN_WIDGETS);
}
