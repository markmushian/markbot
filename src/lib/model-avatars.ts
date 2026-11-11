/**
 * The model marks people actually pick as a face for a bot; each is the vendor's own artwork.
 * Vendor originals live in assets/official-brand/ (Hermes: the official desktop app's dark
 * icon; DeepSeek: deepseek.com's whale favicon + the matching vector mark). The two tiles
 * generated from them are plain 128px rounded squares — no hand-drawn frame, no recolouring.
 */
export const MODEL_AVATARS = [
  { id: "workbuddy", name: "WorkBuddy", image: "/model-avatars/workbuddy.png" },
  { id: "codex", name: "Codex", image: "/model-avatars/codex.png" },
  { id: "claude", name: "Claude", image: "/model-avatars/claude.png" },
  { id: "deepseek", name: "DeepSeek", image: "/model-avatars/deepseek.png" },
  { id: "grok", name: "Grok", image: "/model-avatars/grok.png" },
  { id: "kimi", name: "Kimi", image: "/model-avatars/kimi.png" },
  { id: "qwen", name: "通义千问", image: "/model-avatars/qwen.png" },
  { id: "doubao", name: "豆包", image: "/model-avatars/doubao.png" },
  { id: "gemini", name: "Gemini", image: "/model-avatars/gemini.png" },
  { id: "zcode", name: "ZCode", image: "/model-avatars/zcode.png" },
  { id: "opencode", name: "OpenCode", image: "/model-avatars/opencode.png" },
  { id: "cursor", name: "Cursor", image: "/model-avatars/cursor.png" },
  { id: "hermes", name: "Hermes", image: "/model-avatars/hermes.png" },
  { id: "minimax", name: "MiniMax", image: "/model-avatars/minimax.png" },
  { id: "trae", name: "Trae", image: "/model-avatars/trae.png" },
] as const;
