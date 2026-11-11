import { describe, expect, it } from "vitest";

import { CN_PROVIDERS, cnProvider } from "./cn-providers";

describe("Chinese model providers", () => {
  it("lists each provider once, with its own endpoint", () => {
    const ids = CN_PROVIDERS.map((provider) => provider.id);
    const urls = CN_PROVIDERS.map((provider) => provider.api);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("sends keys only over https, to a versioned OpenAI-compatible path", () => {
    for (const provider of CN_PROVIDERS) {
      expect(provider.api, provider.id).toMatch(/^https:\/\/[^/]+\/(?:.+\/)?v\d[a-z]*(?:\/.*)?$/);
      expect(provider.keys, provider.id).toMatch(/^https:\/\//);
      expect(provider.model.trim(), provider.id).not.toBe("");
      expect(provider.label.trim(), provider.id).not.toBe("");
      expect(provider.alias.trim(), provider.id).not.toBe("");
    }
  });

  it("looks a provider up by id", () => {
    expect(cnProvider("zhipu")?.api).toBe("https://open.bigmodel.cn/api/paas/v4");
    expect(cnProvider("qwen")?.model).toBe("qwen-plus");
    expect(cnProvider("nope")).toBeUndefined();
  });
});
