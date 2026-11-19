/** One error vocabulary for desktop, web, phone and connector.
 *
 * Every surface used to invent its own wording for the same failure ("needs
 * sign in", "连接失败", "provider unavailable", ...). Agents Anywhere ships a
 * single code table that all clients render, so a phone and a desktop can
 * never disagree about what went wrong. This is that table.
 */

export type ClientSurface = "desktop" | "web" | "phone" | "connector";

export type RuntimeStage =
  | "provider"
  | "credential"
  | "mcp"
  | "room"
  | "workflow"
  | "terminal"
  | "device";

export const RUNTIME_ERROR_CODES = [
  "PROVIDER_NOT_INSTALLED",
  "PROVIDER_SIGN_IN_REQUIRED",
  "PROVIDER_DESKTOP_ONLY_SIGN_IN",
  "PROVIDER_QUOTA_EXHAUSTED",
  "PROVIDER_UNAVAILABLE",
  "CREDENTIAL_MISSING",
  "CREDENTIAL_REJECTED",
  "CREDENTIAL_EXPIRED",
  "MCP_UNREACHABLE",
  "MCP_REJECTED",
  "MCP_UNVERIFIABLE",
  "MCP_PROTOCOL",
  "ROOM_QUEUE_FULL",
  "ROOM_DELEGATE_FAILED",
  "WORKFLOW_NO_PATH",
  "WORKFLOW_RETRY_EXHAUSTED",
  "TERMINAL_NOT_PAIRED",
  "TERMINAL_CLOSED",
  "DEVICE_NOT_PAIRED",
] as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

interface CodeText {
  stage: RuntimeStage;
  /** Always Chinese here; each surface may wrap it, but never re-word it. */
  message: string;
  hint: string;
  retryable: boolean;
}

/** The single source of truth. Adding a code without adding text is a type error. */
export const RUNTIME_ERROR_TEXT: Record<RuntimeErrorCode, CodeText> = {
  PROVIDER_NOT_INSTALLED: { stage: "provider", message: "引擎尚未安装。", hint: "安装 CLI 后点「检查更新」重新探测。", retryable: false },
  PROVIDER_SIGN_IN_REQUIRED: { stage: "provider", message: "引擎已安装，但还没有登录。", hint: "点「登录」，按提示在终端完成授权。", retryable: false },
  PROVIDER_DESKTOP_ONLY_SIGN_IN: { stage: "provider", message: "只在桌面应用里登录过，命令行不共享这份登录。", hint: "需要在此处用 CLI 再登录一次；桌面端登录不算数。", retryable: false },
  PROVIDER_QUOTA_EXHAUSTED: { stage: "provider", message: "该账号额度已用完或欠费。", hint: "换一个账号，或到服务商控制台充值后重试。", retryable: true },
  PROVIDER_UNAVAILABLE: { stage: "provider", message: "引擎暂时不可用。", hint: "查看二进制路径是否失效（更新后路径会变），再检查更新。", retryable: true },
  CREDENTIAL_MISSING: { stage: "credential", message: "还有凭证没填写。", hint: "点「填写凭证」，按输入框下方的申请页链接获取。", retryable: false },
  CREDENTIAL_REJECTED: { stage: "credential", message: "凭证被服务端拒绝。", hint: "确认复制完整、没有多余空格或 Bearer 前缀、没有拿错字段。", retryable: false },
  CREDENTIAL_EXPIRED: { stage: "credential", message: "凭证已过期。", hint: "回到申请页重新生成，再粘贴覆盖。", retryable: false },
  MCP_UNREACHABLE: { stage: "mcp", message: "服务没有应答或连不上。", hint: "检查网络、代理和服务状态，稍后点「重新验证」。", retryable: true },
  MCP_REJECTED: { stage: "mcp", message: "服务可达，但拒绝了凭证。", hint: "确认复制的是令牌本身，没带 Bearer 前缀、没带空格、没拿错字段（如 client_id），且权限已发布。", retryable: false },
  MCP_UNVERIFIABLE: { stage: "mcp", message: "地址无法验证。", hint: "核对 MCP 地址是否仍是官方最新地址。", retryable: false },
  MCP_PROTOCOL: { stage: "mcp", message: "对方不是有效的 MCP 服务。", hint: "确认本地命令已安装、npm 包存在、或远程地址正确。", retryable: false },
  ROOM_QUEUE_FULL: { stage: "room", message: "并行任务已满，暂时无法派发。", hint: "等一个任务结束后再派发。", retryable: true },
  ROOM_DELEGATE_FAILED: { stage: "room", message: "子任务派发失败。", hint: "检查目标助手是否在线、是否有可用引擎。", retryable: true },
  WORKFLOW_NO_PATH: { stage: "workflow", message: "工作流没有可执行的路径。", hint: "检查触发器和连线是否完整。", retryable: false },
  WORKFLOW_RETRY_EXHAUSTED: { stage: "workflow", message: "返工次数已用尽。", hint: "查看审核意见，手动修改目标后再运行。", retryable: false },
  TERMINAL_NOT_PAIRED: { stage: "terminal", message: "终端只允许已配对设备使用。", hint: "先在桌面端扫码配对手机。", retryable: false },
  TERMINAL_CLOSED: { stage: "terminal", message: "终端会话已关闭。", hint: "重新打开终端面板即可。", retryable: true },
  DEVICE_NOT_PAIRED: { stage: "device", message: "设备未配对或令牌失效。", hint: "重新扫码配对。", retryable: false },
};

export interface RuntimeError {
  code: RuntimeErrorCode;
  stage: RuntimeStage;
  message: string;
  hint: string;
  retryable: boolean;
  /** Raw provider text, kept for debugging but never used as the user-facing reason. */
  detail?: string;
}

export function isRuntimeErrorCode(value: unknown): value is RuntimeErrorCode {
  return typeof value === "string" && (RUNTIME_ERROR_CODES as readonly string[]).includes(value);
}

export function runtimeError(code: RuntimeErrorCode, detail?: string): RuntimeError {
  const text = RUNTIME_ERROR_TEXT[code];
  return { code, stage: text.stage, message: text.message, hint: text.hint, retryable: text.retryable, ...(detail?.trim() ? { detail: detail.trim().slice(0, 2_000) } : {}) };
}

/** Map a raw provider/HTTP failure onto one code. All four surfaces call this. */
export function runtimeCodeFromFailure(raw: string, status?: number): RuntimeErrorCode {
  const text = raw.toLocaleLowerCase();
  if (/token.*expired|expired.*token|凭证.*过期|令牌.*过期/.test(text)) return "CREDENTIAL_EXPIRED";
  if (status === 401 || status === 403 || /invalid_token|didn't accept the keys|needs you to sign in/.test(text)) {
    return /expired|过期/.test(text) ? "CREDENTIAL_EXPIRED" : "CREDENTIAL_REJECTED";
  }
  if (status === 404 || /http 404|check the address/.test(text)) return "MCP_UNVERIFIABLE";
  if (/timeout|did not answer in time|could not reach|econnrefused|enotfound|http 5\d\d/.test(text)) return "MCP_UNREACHABLE";
  if (/valid mcp tools list|could not start this command/.test(text)) return "MCP_PROTOCOL";
  if (/insufficient balance|quota|rate limit|429|额度/.test(text)) return "PROVIDER_QUOTA_EXHAUSTED";
  if (/account_sign_in_required|not logged in|sign in required/.test(text)) return "PROVIDER_SIGN_IN_REQUIRED";
  if (/command not found|enoent|not installed/.test(text)) return "PROVIDER_NOT_INSTALLED";
  return "PROVIDER_UNAVAILABLE";
}

/** Capability declaration: a runtime says what it can do, and the UI renders only that. */
export interface RuntimeCapabilities {
  surface: ClientSurface;
  providerCli: boolean;
  credentialEntry: boolean;
  mcpProbe: boolean;
  taskDelegation: boolean;
  workflowRun: boolean;
  kanban: boolean;
  draggablePanels: boolean;
  interactiveTerminal: boolean;
  phonePairing: boolean;
}

export const SURFACE_CAPABILITIES: Record<ClientSurface, RuntimeCapabilities> = {
  desktop: { surface: "desktop", providerCli: true, credentialEntry: true, mcpProbe: true, taskDelegation: true, workflowRun: true, kanban: true, draggablePanels: true, interactiveTerminal: true, phonePairing: true },
  web: { surface: "web", providerCli: false, credentialEntry: true, mcpProbe: true, taskDelegation: true, workflowRun: true, kanban: true, draggablePanels: true, interactiveTerminal: false, phonePairing: false },
  phone: { surface: "phone", providerCli: false, credentialEntry: false, mcpProbe: false, taskDelegation: true, workflowRun: false, kanban: true, draggablePanels: false, interactiveTerminal: true, phonePairing: false },
  connector: { surface: "connector", providerCli: true, credentialEntry: false, mcpProbe: true, taskDelegation: false, workflowRun: false, kanban: false, draggablePanels: false, interactiveTerminal: false, phonePairing: false },
};

/** Unknown is a state, not zero. Never render an absent number as 0%. */
export function usageLabel(value: number | null | undefined, unit = "%"): { text: string; known: boolean } {
  if (value === null || value === undefined || !Number.isFinite(value)) return { text: "用量未知", known: false };
  return { text: `${Math.max(0, Math.min(100, Math.round(value)))}${unit}`, known: true };
}
