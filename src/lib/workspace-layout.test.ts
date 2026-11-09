import { describe, expect, it } from "vitest";

import {
  defaultLayout, layoutKey, movePanel, ordered, panelOrder, readLayout,
  resetLayout, setPanelWidth, togglePanel, writeLayout,
} from "./workspace-layout.ts";

const IDS = ["director", "mission", "kanban", "stats"];

function memory() {
  const map = new Map<string, string>();
  return { map, store: { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } } };
}

describe("project-level workspace layout", () => {
  it("keeps a separate layout per project", () => {
    const { store } = memory();
    const a = defaultLayout(IDS);
    writeLayout("project-a", movePanel(a, "kanban", "director"), store);
    expect(panelOrder(readLayout("project-a", IDS, store))).toEqual(["kanban", "director", "mission", "stats"]);
    expect(panelOrder(readLayout("project-b", IDS, store))).toEqual(IDS);
    expect(layoutKey("project-a")).toContain("project-a");
  });

  it("survives a round trip with collapsed, hidden and half-width panels", () => {
    const { store } = memory();
    let layout = defaultLayout(IDS);
    layout = togglePanel(layout, "stats", "collapsed");
    layout = togglePanel(layout, "mission", "visible");
    layout = setPanelWidth(layout, "director", 0.5);
    writeLayout("p", layout, store);
    const restored = readLayout("p", IDS, store);
    expect(restored.stats?.collapsed).toBe(true);
    expect(restored.mission?.visible).toBe(false);
    expect(restored.director?.width).toBe(0.5);
    expect(panelOrder(restored)).toEqual(["director", "kanban", "stats"]);
  });

  it("ignores corrupt data and unknown ids, and adds new widgets with defaults", () => {
    const { map, store } = memory();
    map.set(layoutKey("p"), "{not json");
    expect(panelOrder(readLayout("p", IDS, store))).toEqual(IDS);
    map.set(layoutKey("p"), JSON.stringify({ ghost: { order: 0, visible: true }, director: { order: "bad", visible: "yes", width: 9 } }));
    const restored = readLayout("p", [...IDS, "new-panel"], store);
    expect(restored.ghost).toBeUndefined();
    expect(restored["new-panel"]).toMatchObject({ visible: true, collapsed: false });
    expect(restored.director).toMatchObject({ order: 0, visible: true, width: 1 });
  });

  it("moves a panel before a target and renumbers without gaps", () => {
    const layout = movePanel(defaultLayout(IDS), "stats", "director");
    expect(panelOrder(layout)).toEqual(["stats", "director", "mission", "kanban"]);
    expect(Object.values(ordered(layout)).map((row) => row.order)).toEqual([0, 1, 2, 3]);
    expect(panelOrder(movePanel(layout, "ghost", "director"))).toEqual(panelOrder(layout));
  });

  it("resets back to the shipped order", () => {
    const { store } = memory();
    writeLayout("p", movePanel(defaultLayout(IDS), "kanban", "director"), store);
    expect(panelOrder(resetLayout("p", IDS, store))).toEqual(IDS);
  });
});
