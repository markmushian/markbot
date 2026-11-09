import { describe, expect, it } from "vitest";

import { applyCredentialValues, credentialAdvice, credentialFields, credentialHint, credentialValueError, explainVerifyFailure, findCredentialTargets, MASKED_ARG, maskCredentialArgs, normalizeCredentialValue } from "./mcp-credentials.ts";

const preset = {
  command: "npx",
  args: ["-y", "demo-mcp", "--token=REPLACE_DEMO_TOKEN"],
  env: { DEMO_ID: "REPLACE_DEMO_ID", DEMO_URL: "https://example.com/?key=REPLACE_DEMO_KEY" },
  enabled: false,
};

describe("MCP credential markers", () => {
  it("finds markers in env and argv and remembers where they sat", () => {
    const targets = findCredentialTargets(preset);
    expect(targets).toEqual([
      { source: "env", key: "DEMO_ID", template: "REPLACE_DEMO_ID", tokens: ["DEMO_ID"] },
      { source: "env", key: "DEMO_URL", template: "https://example.com/?key=REPLACE_DEMO_KEY", tokens: ["DEMO_KEY"] },
      { source: "arg", key: "2", template: "--token=REPLACE_DEMO_TOKEN", tokens: ["DEMO_TOKEN"] },
    ]);
    expect(credentialFields(preset, targets).map((field) => [field.token, field.filled])).toEqual([
      ["DEMO_ID", false], ["DEMO_KEY", false], ["DEMO_TOKEN", false],
    ]);
  });

  it("puts values back around the text that surrounded each marker", () => {
    const targets = findCredentialTargets(preset);
    const filled = applyCredentialValues(preset, targets, {
      DEMO_ID: "id-1", DEMO_KEY: "key-1", DEMO_TOKEN: "tok-1",
    });
    expect(filled.env).toMatchObject({ DEMO_ID: "id-1", DEMO_URL: "https://example.com/?key=key-1" });
    expect(filled.args).toEqual(["-y", "demo-mcp", "--token=tok-1"]);
    expect(credentialFields(filled, targets).every((field) => field.filled)).toBe(true);
  });

  it("keeps an already saved value when only one field is typed again", () => {
    const targets = findCredentialTargets(preset);
    const first = applyCredentialValues(preset, targets, { DEMO_ID: "id-1", DEMO_KEY: "key-1", DEMO_TOKEN: "tok-1" });
    const second = applyCredentialValues({ ...first, credentialTargets: targets }, targets, { DEMO_TOKEN: "tok-2" });
    expect(second.env).toMatchObject({ DEMO_ID: "id-1", DEMO_URL: "https://example.com/?key=key-1" });
    expect(second.args).toEqual(["-y", "demo-mcp", "--token=tok-2"]);
  });

  it("leaves untouched servers and unrelated values alone", () => {
    const targets = findCredentialTargets(preset);
    expect(applyCredentialValues(preset, targets, {})).toEqual(preset);
    expect(findCredentialTargets({ command: "npx", args: ["-y", "no-markers"] })).toEqual([]);
  });

  it("masks a filled argv credential in listings but leaves an unfilled marker visible", () => {
    const targets = findCredentialTargets(preset);
    expect(maskCredentialArgs(preset.args, targets)).toEqual({ args: ["-y", "demo-mcp", "--token=REPLACE_DEMO_TOKEN"], masked: false });
    const filled = applyCredentialValues(preset, targets, { DEMO_TOKEN: "tok-1" });
    const shown = maskCredentialArgs(filled.args as string[], targets);
    expect(shown).toEqual({ args: ["-y", "demo-mcp", MASKED_ARG], masked: true });
    expect(JSON.stringify(shown)).not.toContain("tok-1");
  });

  it("gives every shipped preset an actionable console link, not a vague hint", () => {
    const presets = [
      "QQ_EMAIL", "QQ_AUTH_CODE", "TENCENT_DOCS_TOKEN", "GITEE_TOKEN", "BAIDU_PAN_TOKEN",
      "FEISHU_APP_ID", "FEISHU_APP_SECRET", "DINGTALK_APP_KEY", "DINGTALK_APP_SECRET",
      "YUQUE_TOKEN", "TAPD_TOKEN", "OBSIDIAN_API_KEY",
    ];
    for (const token of presets) {
      const hint = credentialHint(token);
      expect(hint.hint.length).toBeGreaterThan(20);
      expect(hint.url, token).toMatch(/^https:\/\//u);
    }
    // These two are step-by-step actions inside desktop apps / TAPD, not console pages.
    expect(credentialHint("WECOM_KEY").url).toBeUndefined();
    expect(credentialHint("TAPD_WORKSPACE_ID").url).toBeUndefined();
    expect(credentialHint("SOMETHING_NEW").hint).toContain("开放平台");
  });

  it("points the Tencent Docs token at the official MCP token page, not the developer-console OAuth token", () => {
    const hint = credentialHint("TENCENT_DOCS_TOKEN");
    expect(hint.url).toBe("https://docs.qq.com/open/auth/mcp.html");
    expect(hint.urlLabel).toContain("官方 MCP Token 页");
    expect(hint.hint).toContain("eyJ");
    expect(hint.hint).toContain("开发者信息");
    expect(hint.links?.some((link) => link.url.includes("get-token"))).toBe(true);
  });

  it("accepts a pasted Baidu OAuth URL and strips a stray Bearer prefix", () => {
    expect(normalizeCredentialValue("baidu-pan", "BAIDU_PAN_TOKEN",
      "https://openapi.baidu.com/oauth/2.0/login_success#expires_in=2592000&access_token=abc.123&scope=basic")).toBe("abc.123");
    expect(normalizeCredentialValue("tencent-docs", "TENCENT_DOCS_TOKEN", "Bearer mcp-token")).toBe("mcp-token");
    expect(normalizeCredentialValue("qqmail", "QQ_AUTH_CODE", "  code  ")).toBe("code");
  });

  it("warns before a wrong Tencent Docs token is saved", () => {
    expect(credentialAdvice("TENCENT_DOCS_TOKEN", "eyJhbGciOiJIUzI1NiJ9.abc.def")).toContain("OAuth");
    expect(credentialAdvice("TENCENT_DOCS_TOKEN", "mcp-token")).toBeNull();
    expect(credentialAdvice("BAIDU_PAN_TOKEN", "https://x#access_token=abc")).toContain("自动取出");
  });

  it("turns a misleading sign-in hint into a credential rejection with a real fix", () => {
    expect(explainVerifyFailure("This server needs you to sign in.", "tencent-docs")).toMatchObject({ kind: "rejected" });
    expect(explainVerifyFailure("This server needs you to sign in.", "tencent-docs").message).toContain("access_token");
    expect(explainVerifyFailure("The server did not answer in time.").kind).toBe("timeout");
    expect(explainVerifyFailure("Could not reach this address. Check the URL and your network.").kind).toBe("unreachable");
    expect(explainVerifyFailure("The server answered HTTP 404. Check the address and headers.").kind).toBe("address");
    expect(explainVerifyFailure("Could not start this command. Check that it is installed and executable.").kind).toBe("protocol");
  });

  it("refuses empty, multiline and placeholder-looking values", () => {
    expect(credentialValueError("")).not.toBeNull();
    expect(credentialValueError("  ")).not.toBeNull();
    expect(credentialValueError("one\ntwo")).not.toBeNull();
    expect(credentialValueError("REPLACE_STILL_THERE")).not.toBeNull();
    expect(credentialValueError("a-real-token")).toBeNull();
  });
});
