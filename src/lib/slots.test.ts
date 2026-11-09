import { describe, expect, it } from "vitest";

import { BUILTIN_WIDGETS, createDefaultRegistry, isSlotKey, slotKey, SlotRegistry } from "./slots.ts";

describe("slot host", () => {
  it("gives built-ins and plugins the same stable key space", () => {
    expect(slotKey("cockpit", "kanban")).toBe("cockpit:kanban");
    expect(isSlotKey("cockpit")).toBe(true);
    expect(isSlotKey("nope")).toBe(false);
  });

  it("lists widgets in order and lets a plugin register into an existing slot", () => {
    const registry = createDefaultRegistry();
    registry.register({ id: "weather", slot: "cockpit", title: "天气", order: 15 });
    expect(registry.list("cockpit").map((widget) => widget.id)).toEqual(
      ["director", "weather", "mission", "kanban", "stats", "devices", "providers"]);
    expect(registry.unregister("cockpit", "weather")).toBe(true);
    expect(registry.list("cockpit").some((widget) => widget.id === "weather")).toBe(false);
  });

  it("keeps a widget visible but unavailable when the surface lacks its capability", () => {
    const registry = createDefaultRegistry();
    const desktop = registry.list("cockpit", "desktop").find((widget) => widget.id === "providers");
    const phone = registry.list("cockpit", "phone").find((widget) => widget.id === "providers");
    expect(desktop?.available).toBe(true);
    expect(phone?.available).toBe(false);
    expect(phone?.reason).toContain("不支持");
    expect(registry.list("cockpit", "phone").length).toBe(registry.list("cockpit", "desktop").length);
  });

  it("rejects an unknown slot instead of silently dropping a widget", () => {
    expect(() => new SlotRegistry([{ id: "x", slot: "bogus" as never, title: "X", order: 1 }])).toThrow("Unknown slot");
    expect(BUILTIN_WIDGETS.length).toBeGreaterThan(5);
  });
});
