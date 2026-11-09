// A room's own notes. Bot memory lives in the bot's workspace folder; a room has no folder of its own, so its notes
// live beside the workspaces, one file per room. Every member's turn reads the same file, which is what makes the room
// remember something its members do not each remember privately.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "./atomic.ts";
import { DATA_DIR } from "./config.ts";

export const GROUP_MEMORY_DIR = join(DATA_DIR, "group-memory");
/** Past this the block is clipped: notes are context, not the conversation, and must not crowd it out. */
export const GROUP_MEMORY_LIMIT = 8_000;

function safeId(groupId: string): string {
  return groupId.replace(/[^\w-]/g, "");
}

export function groupMemoryPath(groupId: string): string {
  return join(GROUP_MEMORY_DIR, `${safeId(groupId)}.md`);
}

export function readGroupMemory(groupId: string): string {
  try {
    return readFileSync(groupMemoryPath(groupId), "utf8");
  } catch {
    return "";
  }
}

export function writeGroupMemory(groupId: string, text: string): void {
  mkdirSync(GROUP_MEMORY_DIR, { recursive: true });
  writeFileAtomic(groupMemoryPath(groupId), text, { mode: 0o600 });
}

/** What a room turn prepends when the room has notes. Empty when it has none, so nothing changes for existing rooms. */
export function groupMemoryBlock(groupId: string, limit = GROUP_MEMORY_LIMIT): string {
  const text = readGroupMemory(groupId).trim();
  if (!text) return "";
  const clipped = text.length > limit ? `${text.slice(0, limit)}\n…` : text;
  return `\n\nWhat this group remembers. Everyone in this group shares these notes; they are not your own memory, and they do not travel to your private chats:\n${clipped}`;
}
