/** Four, and only four, answers to "did this connection work?".
 *
 * A binary ok/fail banner hides the difference that actually matters: a server
 * that answered but refused the key is a *credential* problem, while one that
 * never answered is a *network* problem. Desktop, web, phone and connector all
 * render the same four outcomes from the same function.
 */
import { runtimeCodeFromFailure, runtimeError, type RuntimeErrorCode } from "./runtime-codes.ts";

export type VerifyOutcome = "accepted" | "rejected" | "unreachable" | "unverifiable";

export const VERIFY_OUTCOME_LABEL: Record<VerifyOutcome, string> = {
  accepted: "连接成功 · 凭证被接受",
  rejected: "服务可达 · 凭证被拒绝",
  unreachable: "无应答 · 连不上服务",
  unverifiable: "无法验证 · 地址或协议不对",
};

export const VERIFY_OUTCOME_TONE: Record<VerifyOutcome, "success" | "warning" | "danger"> = {
  accepted: "success", rejected: "warning", unreachable: "danger", unverifiable: "danger",
};

export interface VerifyProbeResult {
  ok: boolean;
  error?: string;
  status?: number;
  reason?: string;
}

export interface VerifyReport {
  outcome: VerifyOutcome;
  label: string;
  code: RuntimeErrorCode | null;
  /** Chinese, actionable, identical on every client. */
  message: string;
  hint: string;
  /** Raw provider text, for the "show details" fold. */
  detail?: string;
}

export function verifyOutcome(result: VerifyProbeResult): VerifyReport {
  if (result.ok) {
    return { outcome: "accepted", label: VERIFY_OUTCOME_LABEL.accepted, code: null,
      message: "连接成功，服务端接受了凭证。", hint: "工具已可正常使用；如果还没启用，验证通过时会自动启用。" };
  }
  const raw = result.error ?? "";
  const detail = raw.trim() || undefined;
  // A credential that was never filled in is neither "rejected" nor a network fault:
  // no connection was even attempted, so check it before any HTTP classification.
  if (/未填写|placeholder|REPLACE_/i.test(raw)) {
    return { outcome: "unverifiable", label: "无法验证 · 还有凭证没填", code: "CREDENTIAL_MISSING",
      message: "还有凭证没填写，本次没有真正发起连接。", hint: "点「填写凭证」把标出的字段补齐，再保存并验证。", ...(detail ? { detail } : {}) };
  }
  const code = runtimeCodeFromFailure(raw, result.status);
  if (result.reason === "keys" || result.status === 401 || result.status === 403
    || code === "CREDENTIAL_REJECTED" || code === "CREDENTIAL_EXPIRED") {
    const error = runtimeError(code === "CREDENTIAL_EXPIRED" ? code : "MCP_REJECTED", detail);
    return { outcome: "rejected", label: VERIFY_OUTCOME_LABEL.rejected, code: error.code, message: error.message, hint: error.hint, ...(detail ? { detail } : {}) };
  }
  if (result.reason === "timeout" || result.reason === "unreachable" || code === "MCP_UNREACHABLE" || code === "PROVIDER_UNAVAILABLE") {
    const error = runtimeError("MCP_UNREACHABLE", detail);
    return { outcome: "unreachable", label: VERIFY_OUTCOME_LABEL.unreachable, code: error.code, message: error.message, hint: error.hint, ...(detail ? { detail } : {}) };
  }
  if (code === "MCP_UNVERIFIABLE" || code === "MCP_PROTOCOL" || result.status === 404) {
    const error = runtimeError(code === "MCP_PROTOCOL" ? code : "MCP_UNVERIFIABLE", detail);
    return { outcome: "unverifiable", label: VERIFY_OUTCOME_LABEL.unverifiable, code: error.code, message: error.message, hint: error.hint, ...(detail ? { detail } : {}) };
  }
  const error = runtimeError("MCP_UNVERIFIABLE", detail);
  return { outcome: "unverifiable", label: VERIFY_OUTCOME_LABEL.unverifiable, code: error.code, message: error.message, hint: error.hint, ...(detail ? { detail } : {}) };
}
