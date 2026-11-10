// Guards against internal runtime harness notifications leaking into user-facing
// assistant responses. When background tasks or subagents finish, ACP runtimes
// (like Google Antigravity or Anthropic harness) inject notifications into the model
// context using <SYSTEM_MESSAGE> wrappers. Confused or echoing models can sometimes
// regurgitate these blocks into the assistant message stream.

const PREAMBLE_REGEX = /^(?:The following is a|Notice: This is a)\s*<SYSTEM_(?:MESSAGE|NOTIFICATION)>[^\n]*\n?/gim;
const SYSTEM_TAG_BLOCK_REGEX = /(?:(?:The following is a|Notice: This is a)\s*<SYSTEM_(?:MESSAGE|NOTIFICATION)>[^\n]*\n*)?<SYSTEM_(?:MESSAGE|NOTIFICATION)>[\s\S]*?<\/SYSTEM_(?:MESSAGE|NOTIFICATION)>/gi;
const UNCLOSED_SYSTEM_TAG_REGEX = /(?:(?:The following is a|Notice: This is a)\s*<SYSTEM_(?:MESSAGE|NOTIFICATION)>[^\n]*\n*)?<SYSTEM_(?:MESSAGE|NOTIFICATION)>[\s\S]*$/gi;
const ORPHANED_TAG_REGEX = /<\/?SYSTEM_(?:MESSAGE|NOTIFICATION)>/gi;

// Hermes' ACP gateway projects a `session.tools_changed` event as an ordinary
// `agent_message_chunk`: "Editor MCP tools changed (servers: ...); the new tool list applies
// from the next turn." It is a notice for the editor, not a reply to the person. The tool
// discovery runs again on every session bind, so the notice otherwise lands in every answer.
// Keep the match line-scoped and prefix-only: a real answer that merely mentions the phrase
// is not a notice, but the notice can be glued to the front of a real answer.
const HERMES_NOTICE_LINE_REGEX = /^[ \t]*Editor MCP tools changed\b[^\n]*(?:\r?\n|$)/gim;
const HERMES_NOTICE_PRESENT_REGEX = /^[ \t]*Editor MCP tools changed\b/im;

/** Drops runtime notice lines without touching the rest of a streamed chunk (no trimming: a delta's
 * trailing space is significant when the next chunk continues the word). */
export function stripRuntimeNoticeLines(text: string): string {
  return text.replace(HERMES_NOTICE_LINE_REGEX, "");
}

/** Strips leaked harness system messages, prompt injection preambles and runtime notices from text. */
export function stripLeakedSystemHarnessMessages(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";
  let result = text.replace(SYSTEM_TAG_BLOCK_REGEX, "");
  result = result.replace(UNCLOSED_SYSTEM_TAG_REGEX, "");
  result = result.replace(PREAMBLE_REGEX, "");
  result = result.replace(ORPHANED_TAG_REGEX, "");
  return stripRuntimeNoticeLines(result).trim();
}

/** Returns true if the message text consists entirely of leaked system harness messages. */
export function isPureLeakedSystemHarnessMessage(text: string | null | undefined): boolean {
  if (!text || typeof text !== "string") return false;
  const hasMarkers = /<SYSTEM_(?:MESSAGE|NOTIFICATION)>/i.test(text)
    || /The following is a <SYSTEM_/i.test(text)
    || HERMES_NOTICE_PRESENT_REGEX.test(text);
  if (!hasMarkers) return false;
  return stripLeakedSystemHarnessMessages(text).length === 0;
}
