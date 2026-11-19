import type { InstanceInfo } from "@/state/store";
import { runtimeError, type RuntimeErrorCode, usageLabel } from "../../shared/runtime-codes.ts";

/** Timon's provider card has four states, not two. A binary that exists but has
 * no CLI login is a different problem from a binary that is missing, and a
 * desktop-app login is a third one again: the CLI never sees that session.
 * Collapsing all of them into "needs setup" is what kept sending people back to
 * a sign-in loop.
 */
export type ProviderState = "not-installed" | "needs-sign-in" | "desktop-sign-in" | "ready";

export type ProviderAction = "install" | "sign-in" | "check-updates" | "manage";

export interface ProviderStatus {
  state: ProviderState;
  label: string;
  /** Why it is in this state, in Chinese, safe to show verbatim. */
  reason: string;
  /** null when ready: a healthy provider has no error code. */
  code: RuntimeErrorCode | null;
  version: string | null;
  /** The executable actually used, so a stale path after an update is visible. */
  cliPath: string | null;
  updateAvailable: boolean;
  actions: ProviderAction[];
  /** Unknown usage must never be rendered as 0. */
  usage: { text: string; known: boolean };
}

export const PROVIDER_STATE_LABEL: Record<ProviderState, string> = {
  "not-installed": "未安装",
  "needs-sign-in": "已安装 · 待登录",
  "desktop-sign-in": "桌面应用登录 · 命令行未登录",
  ready: "就绪",
};

export const PROVIDER_STATE_RANK: Record<ProviderState, number> = {
  "desktop-sign-in": 0, "needs-sign-in": 1, "not-installed": 2, ready: 3,
};

/** Some CLIs print their own executable name instead of a version. */
function cleanVersion(raw: string | null | undefined): string | null {
  return raw?.match(/\d+\.\d+(?:\.\d+)?(?:[-+][\w.-]+)?/)?.[0] ?? null;
}

function desktopOnly(instance: InstanceInfo): boolean {
  const method = instance.authentication?.method;
  if (method === "browser" || method === "browser-pkce") return true;
  const text = `${instance.snapshot.reason ?? ""} ${instance.snapshot.authenticationUnavailableReason ?? ""}`.toLocaleLowerCase();
  return /desktop app|桌面(应用|端)|account_sign_in_required|not shared|sign in.*app/i.test(text);
}

export function providerStatus(instance: InstanceInfo, usagePercent?: number | null): ProviderStatus {
  const version = cleanVersion(instance.snapshot.version);
  const cliPath = instance.cli ?? instance.cliCandidates?.[0] ?? instance.cliDefault ?? null;
  const updateAvailable = Boolean(instance.snapshot.update);
  const usage = usageLabel(usagePercent);

  const base = { version, cliPath, updateAvailable, usage };

  if (instance.snapshot.state !== "available") {
    return {
      ...base,
      state: "not-installed",
      label: PROVIDER_STATE_LABEL["not-installed"],
      reason: instance.snapshot.reason || "没有探测到可用的命令行程序。安装后点「检查更新」重新探测。",
      code: "PROVIDER_NOT_INSTALLED",
      actions: ["install", "check-updates"],
    };
  }

  if (instance.snapshot.authenticated === false) {
    const desktop = desktopOnly(instance);
    return {
      ...base,
      state: desktop ? "desktop-sign-in" : "needs-sign-in",
      label: PROVIDER_STATE_LABEL[desktop ? "desktop-sign-in" : "needs-sign-in"],
      reason: desktop
        ? "这个账号只在桌面应用里登录过，命令行读不到那份登录态。需要在此处用 CLI 再登录一次。"
        : instance.snapshot.authenticationUnavailableReason || instance.snapshot.reason || "命令行已就绪，但还没有完成登录。",
      code: desktop ? "PROVIDER_DESKTOP_ONLY_SIGN_IN" : "PROVIDER_SIGN_IN_REQUIRED",
      actions: ["sign-in", "check-updates"],
    };
  }

  if (instance.access !== "custom" && instance.snapshot.authenticated === undefined && instance.snapshot.freeFallback) {
    return {
      ...base,
      state: "needs-sign-in",
      label: "免费备用模型 · 未登录",
      reason: "当前只能用免登录的备用模型，不是完整账号。登录后可使用全部模型。",
      code: "PROVIDER_SIGN_IN_REQUIRED",
      actions: ["sign-in", "check-updates"],
    };
  }

  return {
    ...base,
    state: "ready",
    label: PROVIDER_STATE_LABEL.ready,
    reason: version ? `命令行可用 · v${version}` : "命令行可用。",
    code: null,
    actions: ["check-updates", "manage"],
  };
}

/** Sort the broken ones first: that is the whole point of a status card. */
export function orderByProviderState(instances: readonly InstanceInfo[]): InstanceInfo[] {
  return [...instances].sort((a, b) =>
    PROVIDER_STATE_RANK[providerStatus(a).state] - PROVIDER_STATE_RANK[providerStatus(b).state]
    || a.displayName.localeCompare(b.displayName, "zh-CN"));
}

/** A one-line, four-surface-consistent diagnosis for a failing probe. */
export function providerRuntimeError(instance: InstanceInfo, raw?: string) {
  const code = providerStatus(instance).code ?? "PROVIDER_UNAVAILABLE";
  return runtimeError(code, raw ?? instance.snapshot.reason);
}
