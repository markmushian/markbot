import { describe, expect, it } from "vitest";
import type { InstanceInfo } from "@/state/store";

import { orderByProviderState, providerStatus, PROVIDER_STATE_LABEL } from "./provider-status.ts";

function instance(patch: Partial<InstanceInfo> = {}): InstanceInfo {
  return {
    instanceId: "id", driverKind: "claudeAgent", displayName: "Claude Code",
    snapshot: { state: "available", authenticated: true },
    models: { default: "", options: [] },
    ...patch,
  } as InstanceInfo;
}

describe("provider four-state card", () => {
  it("reports a missing binary as not-installed with install and check-updates", () => {
    const status = providerStatus(instance({ snapshot: { state: "unavailable", reason: "codex.exe not found" } }));
    expect(status.state).toBe("not-installed");
    expect(status.code).toBe("PROVIDER_NOT_INSTALLED");
    expect(status.actions).toEqual(["install", "check-updates"]);
    expect(status.reason).toContain("not found");
  });

  it("separates a CLI that needs sign-in from a desktop-app-only login", () => {
    const cli = providerStatus(instance({ snapshot: { state: "available", authenticated: false } }));
    expect(cli.state).toBe("needs-sign-in");
    expect(cli.code).toBe("PROVIDER_SIGN_IN_REQUIRED");

    const desktop = providerStatus(instance({
      snapshot: { state: "available", authenticated: false },
      authentication: { method: "browser-pkce" },
    }));
    expect(desktop.state).toBe("desktop-sign-in");
    expect(desktop.code).toBe("PROVIDER_DESKTOP_ONLY_SIGN_IN");
    expect(desktop.reason).toContain("桌面应用");
    expect(desktop.actions).toContain("sign-in");
  });

  it("also recognises a desktop-only sign-in described only in the reason text", () => {
    const status = providerStatus(instance({
      snapshot: { state: "available", authenticated: false, reason: "ACCOUNT_SIGN_IN_REQUIRED (desktop app login is not shared)" },
    }));
    expect(status.state).toBe("desktop-sign-in");
  });

  it("does not call a free no-login fallback model a ready account", () => {
    const status = providerStatus(instance({ snapshot: { state: "available", freeFallback: true } }));
    expect(status.state).toBe("needs-sign-in");
    expect(status.label).toContain("备用模型");
  });

  it("exposes version, binary path and update so a stale hash path is visible", () => {
    const status = providerStatus(instance({
      cli: "C:/Users/me/AppData/Local/Codex/bin/8f3a/codex.exe",
      snapshot: { state: "available", authenticated: true, version: "codex-cli 0.77.0", update: { title: "Update", message: "new", command: "npm i -g" } },
    }));
    expect(status.state).toBe("ready");
    expect(status.version).toBe("0.77.0");
    expect(status.cliPath).toContain("8f3a");
    expect(status.updateAvailable).toBe(true);
    expect(status.code).toBeNull();
  });

  it("never shows unknown usage as zero", () => {
    expect(providerStatus(instance()).usage).toEqual({ text: "用量未知", known: false });
    expect(providerStatus(instance(), 0).usage).toEqual({ text: "0%", known: true });
  });

  it("sorts broken providers ahead of ready ones", () => {
    const ready = instance({ instanceId: "ready", displayName: "Ready" });
    const broken = instance({ instanceId: "broken", displayName: "Broken", snapshot: { state: "unavailable" } });
    const desktop = instance({ instanceId: "desktop", displayName: "Desktop", snapshot: { state: "available", authenticated: false }, authentication: { method: "browser" } });
    expect(orderByProviderState([ready, broken, desktop]).map((item) => item.instanceId)).toEqual(["desktop", "broken", "ready"]);
  });

  it("has a label for all four states", () => {
    expect(Object.keys(PROVIDER_STATE_LABEL).sort()).toEqual(["desktop-sign-in", "needs-sign-in", "not-installed", "ready"]);
  });
});
