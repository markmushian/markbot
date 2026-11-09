// The engine instances a fresh install starts with, and the ones an existing product fleet gains.
// instanceConfigs (config.ts) copies every entry before it changes one.
import type { InstanceConfigMap } from "./contracts.ts";

export const OPENAI_API_INSTANCE = "openai";
export const OPENROUTER_API_INSTANCE = "openrouter";
export const DOUBAO_API_INSTANCE = "doubaoApi";
export const XAI_API_INSTANCE = "xaiApi";
export const CLAUDE_API_INSTANCE = "claudeApi";
export const API_KEY_FLEET: InstanceConfigMap = {
  [OPENAI_API_INSTANCE]: {
    driver: "openai-compat", displayName: "OpenAI", access: "api", icon: { kind: "preset", preset: "openai" },
    config: { url: "https://api.openai.com/v1", apiKeyEnv: "OMB_OPENAI_API_KEY", catalog: "openai" },
  },
  [CLAUDE_API_INSTANCE]: {
    driver: "claudeAgent", displayName: "Claude (API key)", access: "api", icon: { kind: "preset", preset: "anthropic" },
    config: { requireApiKey: true },
  },
  [XAI_API_INSTANCE]: { driver: "grok", displayName: "xAI", access: "api", icon: { kind: "preset", preset: "xai" } },
  [OPENROUTER_API_INSTANCE]: {
    driver: "openai-compat", displayName: "OpenRouter", access: "api", icon: { kind: "preset", preset: "openrouter" },
    config: { url: "https://openrouter.ai/api/v1", apiKeyEnv: "OMB_OPENROUTER_API_KEY" },
  },
  // Ark (Volcengine) speaks the OpenAI wire format, so Doubao is a provider card of its own rather than a
  // custom server someone has to type in by hand.
  [DOUBAO_API_INSTANCE]: {
    driver: "openai-compat", displayName: "豆包", access: "api",
    config: { url: "https://ark.cn-beijing.volces.com/api/v3", apiKeyEnv: "OMB_DOUBAO_API_KEY" },
  },
};

// Google retired Gemini CLI for the free/Pro/Ultra tiers on 2026-06-18; enterprise licences restore it with
// `{"instances": {"gemini": {"driver": "geminiAgent"}}}`.
export const DEFAULT_FLEET: InstanceConfigMap = {
  grok: { driver: "grokAgent" },
  kimi: { driver: "kimiAgent" },
  droid: { driver: "droidAgent" },
  cursor: { driver: "cursorAgent" },
  githubCopilot: { driver: "copilotAgent" },
  claude: { driver: "claudeAgent" },
  codex: { driver: "codex" },
  // A ChatGPT plan signs in through its own account, so it is a separate entry from the Codex
  // CLI account. It used to render with the same name and mark as codex, which read as a duplicate.
  chatgpt: { driver: "codex", displayName: "ChatGPT 方案", config: { authMode: "chatgpt-plan" } },
  antigravity: { driver: "antigravityAgent" },
  opencodeGo: { driver: "opencodeGo" },
  openaiCompat: { driver: "openai-compat" },
  mistral: { driver: "mistral" },
  cerebras: { driver: "cerebras" },
  groq: { driver: "groq" },
  meta: { driver: "meta" },
  deepseek: { driver: "deepseekAgent" },
  museCode: { driver: "museCode" },
  ...API_KEY_FLEET,
  qwen: { driver: "qwenAgent" },
  hermes: { driver: "hermesAgent" },
  cline: { driver: "clineAgent" },
  pi: { driver: "piAgent" },
};

const CUSTOM_ONLY = {
  qwen: { driver: "qwenAgent" },
  hermes: { driver: "hermesAgent" },
  cline: { driver: "clineAgent" },
  pi: { driver: "piAgent" },
} as const;

/** Added to a saved fleet that holds a product engine (claude, grok or codex), when it lacks them. */
export const PRODUCT_FLEET_ADDITIONS = {
  // A ChatGPT plan is its own sign-in, so a saved fleet gains it next to Codex. The display name
  // says which account it is; both share the codex driver.
  chatgpt: { driver: "codex", displayName: "ChatGPT 方案", config: { authMode: "chatgpt-plan" } },
  // A saved fleet from an older build predates these agent CLIs, so it never gained them:
  // the engines existed in DEFAULT_FLEET but nothing added them back. They cost nothing when
  // uninstalled (the card offers the install command), and a person who has the CLI gets it.
  grok: { driver: "grokAgent" },
  kimi: { driver: "kimiAgent" },
  droid: { driver: "droidAgent" },
  antigravity: { driver: "antigravityAgent" },
  opencodeGo: { driver: "opencodeGo" },
  cursor: { driver: "cursorAgent" },
  githubCopilot: { driver: "copilotAgent" },
  openaiCompat: { driver: "openai-compat" },
  mistral: { driver: "mistral" },
  cerebras: { driver: "cerebras" },
  groq: { driver: "groq" },
  meta: { driver: "meta" },
  deepseek: { driver: "deepseekAgent" },
  museCode: { driver: "museCode" },
  ...API_KEY_FLEET,
  ...CUSTOM_ONLY,
} as const;
