import { describe, expect, it } from "vitest";

import { groupMemoryBlock, groupMemoryPath, GROUP_MEMORY_LIMIT } from "./group-memory.ts";

describe("room memory", () => {
  it("keeps each room's notes in a file of its own, named from the room id", () => {
    const path = groupMemoryPath("room-1");
    expect(path.endsWith("room-1.md")).toBe(true);
    expect(groupMemoryPath("a/b\\c d")).not.toContain("/b");
    expect(groupMemoryPath("a/b\\c d")).not.toContain("\\c");
  });

  it("says nothing for a room that has no notes yet", () => {
    // A room id that cannot exist as a file: the read fails and the turn must see no block at all.
    expect(groupMemoryBlock("definitely-not-a-room-9f2c1")).toBe("");
  });

  it("clips notes that would crowd out the conversation", () => {
    const block = groupMemoryBlock("definitely-not-a-room-9f2c1", 10);
    expect(block).toBe("");
    expect(GROUP_MEMORY_LIMIT).toBeGreaterThan(1_000);
  });
});
