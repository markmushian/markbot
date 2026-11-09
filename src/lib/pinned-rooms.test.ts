import { describe, expect, it } from "vitest";

import { loadPinnedRooms, setPinnedRooms, togglePinnedRoom } from "./sidebar-preferences";

/** The smallest Storage these reads and writes touch. */
function memoryStorage(initial: string | null = null): { value: string | null; getItem(): string | null; setItem(_key: string, next: string): void } {
  return {
    value: initial,
    getItem() { return this.value; },
    setItem(_key: string, next: string) { this.value = next; },
  };
}

describe("pinned rooms", () => {
  it("appends a new pin so the newest sits last", () => {
    expect(togglePinnedRoom(["room-b"], "room-c")).toEqual(["room-b", "room-c"]);
    expect(togglePinnedRoom([], "room-a")).toEqual(["room-a"]);
  });

  it("removes a pin without disturbing the others", () => {
    expect(togglePinnedRoom(["room-a", "room-b", "room-c"], "room-b")).toEqual(["room-a", "room-c"]);
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    setPinnedRooms(["room-a", "room-b"], storage);
    expect(loadPinnedRooms(storage)).toEqual(["room-a", "room-b"]);
  });

  it("keeps one of each and caps the list", () => {
    const storage = memoryStorage();
    const many = Array.from({ length: 120 }, (_, index) => `room-${index}`);
    setPinnedRooms([...many, "room-0"], storage);
    const saved = loadPinnedRooms(storage);
    expect(saved).toHaveLength(100);
    expect(new Set(saved).size).toBe(100);
  });

  it("reads nothing from a store that holds garbage", () => {
    expect(loadPinnedRooms(memoryStorage("not json"))).toEqual([]);
    expect(loadPinnedRooms(memoryStorage(null))).toEqual([]);
  });
});
