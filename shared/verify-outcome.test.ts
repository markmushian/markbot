import { describe, expect, it } from "vitest";

import { VERIFY_OUTCOME_LABEL, verifyOutcome } from "./verify-outcome.ts";

describe("four explicit verify outcomes", () => {
  it("accepts a successful probe with tool counts", () => {
    const report = verifyOutcome({ ok: true });
    expect(report.outcome).toBe("accepted");
    expect(report.code).toBeNull();
    expect(report.label).toBe(VERIFY_OUTCOME_LABEL.accepted);
  });

  it("separates a reachable server that refuses the key", () => {
    const report = verifyOutcome({ ok: false, status: 401, reason: "keys", error: "The server didn't accept the keys (HTTP 401)." });
    expect(report.outcome).toBe("rejected");
    expect(report.hint).toContain("Bearer");
    expect(report.detail).toContain("HTTP 401");
  });

  it("separates a server that never answered", () => {
    for (const result of [
      { ok: false, reason: "timeout", error: "The MCP server did not answer in time." },
      { ok: false, reason: "unreachable", error: "Could not reach this address." },
    ]) {
      const report = verifyOutcome(result);
      expect(report.outcome).toBe("unreachable");
      expect(report.message).toContain("没有应答");
    }
  });

  it("separates a 404 / non-MCP endpoint that cannot be verified", () => {
    expect(verifyOutcome({ ok: false, status: 404, error: "The server answered HTTP 404. Check the address and headers." }).outcome).toBe("unverifiable");
    expect(verifyOutcome({ ok: false, error: "The server did not return a valid MCP tools list." }).outcome).toBe("unverifiable");
  });

  it("does not call a placeholder credential a real connection failure", () => {
    const report = verifyOutcome({ ok: false, error: "还有凭证未填写：Authorization。请点「填写凭证」把它们填好，再来验证。" });
    expect(report.outcome).toBe("unverifiable");
    expect(report.code).toBe("CREDENTIAL_MISSING");
  });

  it("never leaves a failure without Chinese guidance", () => {
    const report = verifyOutcome({ ok: false, error: "weird unexplained error" });
    expect(report.message.length).toBeGreaterThan(0);
    expect(report.hint.length).toBeGreaterThan(0);
    expect(Object.keys(VERIFY_OUTCOME_LABEL).sort()).toEqual(["accepted", "rejected", "unreachable", "unverifiable"]);
  });
});
