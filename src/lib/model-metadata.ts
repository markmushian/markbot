import type { InstanceInfo } from "@/state/store";
import { providerStatus } from "./provider-status";

/** Context window, "New" badge, favourites and the reason a model is visible
 * but not selectable. Timon's picker shows all four; a plain list hides them.
 * When a provider does not report a window we return null, and the ring draws
 * an unknown state rather than a misleading 0.
 */
export interface ModelMeta {
  contextWindow: number | null;
  /** Short form for a badge, e.g. 200K / 1M. */
  windowLabel: string | null;
  isNew: boolean;
}

const WINDOW_RULES: Array<[RegExp, number]> = [
  [/gemini[-_]?3|gemini[-_]?2\.5|gemini[-_]?1\.5/i, 1_000_000],
  [/gpt[-_]?4\.1|gpt[-_]?5|o3|o4/i, 1_000_000],
  [/claude[-_]?(?:opus|sonnet|haiku)?[-_]?4|claude[-_]?3/i, 200_000],
  [/kimi[-_]?k2|kimi[-_]?2/i, 256_000],
  [/doubao|seed/i, 256_000],
  [/grok[-_]?4/i, 256_000],
  [/grok|deepseek|qwen|glm|mistral|command/i, 128_000],
  [/gpt[-_]?4o|gpt[-_]?4|o1/i, 128_000],
  [/llama|qwen[23]|phi|mistral[-_]?7/i, 32_000],
];

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`;
  return `${Math.round(tokens / 1_000)}K`;
}

/** New models are identified by an explicit year in the id or a known launch name. */
const NEW_MODEL = /2026|gpt-5|claude-(?:opus|sonnet)-4[-.]?[56]|gemini-3|grok-4|kimi-k2|o3|o4|deepseek-v4|doubao-seed-2/i;

export function modelMeta(modelId: string, declared?: number | null): ModelMeta {
  const contextWindow = typeof declared === "number" && Number.isFinite(declared) && declared > 0
    ? declared
    : WINDOW_RULES.find(([pattern]) => pattern.test(modelId))?.[1] ?? null;
  return {
    contextWindow,
    windowLabel: contextWindow ? formatContextWindow(contextWindow) : null,
    isNew: NEW_MODEL.test(modelId),
  };
}

/** A model stays visible when its provider is broken: greying it out entirely
 * makes people think the model was removed. */
export function modelUnavailableReason(instance: InstanceInfo | undefined): string | null {
  if (!instance) return "这个服务商当前不可用。";
  const status = providerStatus(instance);
  switch (status.state) {
    case "not-installed": return "引擎未安装，先安装命令行程序。";
    case "needs-sign-in": return "这个账号还没登录，登录后才能选择它的模型。";
    case "desktop-sign-in": return "只在桌面应用登录过，命令行需要再登录一次。";
    default: return null;
  }
}

const FAVORITES_KEY = "markbot.model-favorites";

export function favoriteKey(instanceId: string, modelId: string): string {
  return `${instanceId}:${modelId}`;
}

export function readModelFavorites(storage?: Pick<Storage, "getItem">): ReadonlySet<string> {
  try {
    const raw = (storage ?? (typeof localStorage === "undefined" ? null : localStorage))?.getItem(FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeModelFavorites(favorites: ReadonlySet<string>, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? (typeof localStorage === "undefined" ? null : localStorage))?.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Private mode: favourites simply do not persist.
  }
}

export function toggleModelFavorite(favorites: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(favorites);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/** Cross-provider search: find models outside the currently selected provider. */
export function searchAcrossProviders(instances: readonly InstanceInfo[], currentId: string | undefined, query: string, limit = 6) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches: Array<{ instance: InstanceInfo; model: { id: string; label: string; provider?: string } }> = [];
  for (const instance of instances) {
    if (instance.instanceId === currentId) continue;
    for (const model of instance.models?.options ?? []) {
      if (`${model.label} ${model.id} ${model.provider ?? ""} ${instance.displayName}`.toLocaleLowerCase().includes(needle)) {
        matches.push({ instance, model });
        if (matches.length >= limit) return matches;
      }
    }
  }
  return matches;
}
