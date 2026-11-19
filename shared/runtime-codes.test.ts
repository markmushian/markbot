import { describe, expect, it } from "vitest";

import {
  RUNTIME_ERROR_CODES, RUNTIME_ERROR_TEXT, isRuntimeErrorCode, runtimeCodeFromFailure,
  runtimeError, SURFACE_CAPABILITIES, usageLabel,
} from "./runtime-codes.ts";

describe("runtime error codes", () => {
  it("gives every code one text entry, so no surface can invent wording", () => {
    expect(Object.keys(RUNTIME_ERROR_TEXT).sort()).toEqual([...RUNTIME_ERROR_CODES].sort());
    for (const code of RUNTIME_ERROR_CODES) {
      expect(RUNTIME_ERROR_TEXT[code].message.length).toBeGreaterThan(0);
      expect(RUNTIME_ERROR_TEXT[code].hint.length).toBeGreaterThan(0);
    }
  });

  it("keeps the raw provider text only as detail, never as the message", () => {
    const error = runtimeError("PROVIDER_SIGN_IN_REQUIRED", "ACCOUNT_SIGN_IN_REQUIRED: please log in");
    expect(error.message).toBe(RUNTIME_ERROR_TEXT.PROVIDER_SIGN_IN_REQUIRED.message);
    expect(error.detail).toContain("ACCOUNT_SIGN_IN_REQUIRED");
    expect(error.stage).toBe("provider");
    expect(runtimeError("MCP_UNREACHABLE").detail).toBeUndefined();
  });

  it("maps the same failure to the same code regardless of who reports it", () => {
    expect(runtimeCodeFromFailure("HTTP 401 Unauthorized", 401)).toBe("CREDENTIAL_REJECTED");
    expect(runtimeCodeFromFailure("invalid_token")).toBe("CREDENTIAL_REJECTED");
    expect(runtimeCodeFromFailure("token expired")).toBe("CREDENTIAL_EXPIRED");
    expect(runtimeCodeFromFailure("HTTP 404", 404)).toBe("MCP_UNVERIFIABLE");
    expect(runtimeCodeFromFailure("did not answer in time")).toBe("MCP_UNREACHABLE");
    expect(runtimeCodeFromFailure("ECONNREFUSED 127.0.0.1")).toBe("MCP_UNREACHABLE");
    expect(runtimeCodeFromFailure("no valid MCP tools list")).toBe("MCP_PROTOCOL");
    expect(runtimeCodeFromFailure("ACCOUNT_SIGN_IN_REQUIRED")).toBe("PROVIDER_SIGN_IN_REQUIRED");
    expect(runtimeCodeFromFailure("spawn codex ENOENT")).toBe("PROVIDER_NOT_INSTALLED");
    expect(runtimeCodeFromFailure("1113 Insufficient balance")).toBe("PROVIDER_QUOTA_EXHAUSTED");
  });

  it("validates codes coming from another surface", () => {
    expect(isRuntimeErrorCode("MCP_REJECTED")).toBe(true);
    expect(isRuntimeErrorCode("MCP_REJECTED ")).toBe(false);
    expect(isRuntimeErrorCode("SOMETHING_ELSE")).toBe(false);
    expect(isRuntimeErrorCode(null)).toBe(false);
  });

  it("declares capabilities per surface without pretending a phone can install a CLI", () => {
    expect(SURFACE_CAPABILITIES.desktop.providerCli).toBe(true);
    expect(SURFACE_CAPABILITIES.phone.providerCli).toBe(false);
    expect(SURFACE_CAPABILITIES.phone.interactiveTerminal).toBe(true);
    expect(SURFACE_CAPABILITIES.web.interactiveTerminal).toBe(false);
    expect(SURFACE_CAPABILITIES.connector.taskDelegation).toBe(false);
  });

  it("treats unknown usage as unknown, never as zero", () => {
    expect(usageLabel(null)).toEqual({ text: "用量未知", known: false });
    expect(usageLabel(undefined)).toEqual({ text: "用量未知", known: false });
    expect(usageLabel(Number.NaN).known).toBe(false);
    expect(usageLabel(0)).toEqual({ text: "0%", known: true });
    expect(usageLabel(187)).toEqual({ text: "100%", known: true });
  });
});
