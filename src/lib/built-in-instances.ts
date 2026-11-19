/** The server's default instances by id, with their driver kinds, plus `gemini`, which an enterprise licence restores. */
export const BUILT_IN_INSTANCE_DRIVERS: Readonly<Record<string, string>> = {
  grok: "grokAgent", kimi: "kimiAgent", droid: "droidAgent", cursor: "cursorAgent", githubCopilot: "copilotAgent", claude: "claudeAgent", codex: "codex",
  chatgpt: "codex", antigravity: "antigravityAgent", opencodeGo: "opencodeGo", openaiCompat: "openai-compat",
  mistral: "mistral", cerebras: "cerebras", groq: "groq", doubaoApi: "openai-compat", meta: "meta", museCode: "museCode", deepseek: "deepseekAgent", openai: "openai-compat",
  claudeApi: "claudeAgent", xaiApi: "grok", openrouter: "openai-compat", qwen: "qwenAgent", hermes: "hermesAgent",
  cline: "clineAgent", pi: "piAgent", gemini: "geminiAgent",
};

/**
 * Engines that are agent CLIs running on this computer (as opposed to pure model-provider APIs).
 * The server keeps its own copy in server/routes/instances.ts; keep the two lists in sync.
 * These engines get the same "link a local CLI" control, model re-detection and status test.
 */
export const AGENT_CLI_DRIVERS: ReadonlySet<string> = new Set([
  "customAcp", "claudeAgent", "codex", "cursorAgent", "copilotAgent", "qwenAgent",
  "hermesAgent", "clineAgent", "piAgent", "droidAgent", "kimiAgent", "grokAgent",
  "deepseekAgent", "opencodeGo", "antigravityAgent", "geminiAgent", "museCode",
]);

export function isAgentCliDriver(driverKind: string | null | undefined): boolean {
  return Boolean(driverKind && AGENT_CLI_DRIVERS.has(driverKind));
}
