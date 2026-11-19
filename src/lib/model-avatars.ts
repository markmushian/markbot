/**
 * The model marks people actually pick as a face for a bot; each is the vendor's own artwork.
 * All tiles (except the project-specific ZCode mark) come from LobeHub's official icon set:
 * https://github.com/lobehub/lobe-icons / @lobehub/icons-static-avatar.
 * Vendor originals and the slug manifest live in assets/official-brand/lobehub/.
 * Tiles are 128px rounded squares generated from the originals — no frames, no redraws.
 * Exceptions: hermes.png / deepseek.png come from vendor ico files; doubao.png keeps the
 * earlier round 3D girl and codex.png uses the OpenAI knot. Originals live in
 * assets/official-brand/user-provided/ (restored/ holds the pre-LobeHub artwork).
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
