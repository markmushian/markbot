import { describe, expect, it } from "vitest";
import type { InstanceInfo } from "@/state/store";

import {
  favoriteKey, formatContextWindow, modelMeta, modelUnavailableReason,
  readModelFavorites, searchAcrossProviders, toggleModelFavorite, writeModelFavorites,
} from "./model-metadata.ts";

function instance(id: string, models: Array<{ id: string; label: string; provider?: string }>, snapshot: Partial<InstanceInfo["snapshot"]> = {}): InstanceInfo {
  return { instanceId: id, displayName: id, driverKind: "test", snapshot: { state: "available", authenticated: true, ...snapshot }, models: { default: "", options: models } } as InstanceInfo;
}

describe("model metadata", () => {
  it("infers a context window from the model id, and never invents one for unknown models", () => {
    expect(modelMeta("claude-sonnet-4-5").windowLabel).toBe("200K");
    expect(modelMeta("gemini-3-pro").windowLabel).toBe("1M");
    expect(modelMeta("gpt-4.1").windowLabel).toBe("1M");
    expect(modelMeta("my-custom-local-model").contextWindow).toBeNull();
    expect(modelMeta("custom", 64_000).windowLabel).toBe("64K");
    expect(formatContextWindow(1_000_000)).toBe("1M");
    expect(formatContextWindow(200_000)).toBe("200K");
  });

  it("marks genuinely new models", () => {
    expect(modelMeta("gpt-5").isNew).toBe(true);
    expect(modelMeta("gemini-3-pro").isNew).toBe(true);
    expect(modelMeta("model-2026-11").isNew).toBe(true);
    expect(modelMeta("gpt-4o").isNew).toBe(false);
  });

  it("keeps a broken provider's models visible but explains why they cannot be picked", () => {
    expect(modelUnavailableReason(instance("a", [], { state: "unavailable" }))).toContain("未安装");
    expect(modelUnavailableReason(instance("a", [], { authenticated: false }))).toContain("登录");
    expect(modelUnavailableReason(instance("a", [], { authenticated: false, reason: "desktop app login is not shared" }))).toContain("桌面应用");
    expect(modelUnavailableReason(instance("a", []))).toBeNull();
    expect(modelUnavailableReason(undefined)).not.toBeNull();
  });

  it("persists favourites and tolerates corrupt storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => { store.set(key, value); } };
    const key = favoriteKey("claude", "claude-sonnet-4-5");
    expect(readModelFavorites(storage).size).toBe(0);
    const added = toggleModelFavorite(readModelFavorites(storage), key);
    writeModelFavorites(added, storage);
    expect(readModelFavorites(storage).has(key)).toBe(true);
    const removed = toggleModelFavorite(added, key);
    expect(removed.has(key)).toBe(false);
    store.set("markbot.model-favorites", "{not json");
    expect(readModelFavorites(storage).size).toBe(0);
  });

  it("searches models across providers, excluding the one already open", () => {
    const current = instance("claude", [{ id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" }]);
    const other = instance("openai", [{ id: "gpt-5", label: "GPT-5" }, { id: "gpt-4o", label: "GPT-4o" }]);
    expect(searchAcrossProviders([current, other], "claude", "gpt-5")).toEqual([{ instance: other, model: other.models.options[0] }]);
    expect(searchAcrossProviders([current, other], "claude", "sonnet")).toEqual([]);
    expect(searchAcrossProviders([current, other], "claude", "gpt")).toHaveLength(2);
    expect(searchAcrossProviders([current, other], "claude", "  ")).toEqual([]);
  });
});
