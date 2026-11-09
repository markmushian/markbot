import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  MAX_INPUT_CHARS,
  MAX_TERMINAL_SESSIONS,
  TerminalManager,
  terminalCommand,
} from "./remote-terminal.ts";

/** A shell stand-in: all the manager uses is stdin/stdout/stderr, exit/error
 * events and kill. No real process is spawned in these tests. */
class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;
  kill(): boolean { this.killed = true; return true; }
  asProcess(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams;
  }
  typed(): string {
    return String(this.stdin.read()?.toString("utf8") ?? "");
  }
}

const managerWith = (children: FakeChild[], overrides: Partial<ConstructorParameters<typeof TerminalManager>[0]> = {}) =>
  new TerminalManager({
    spawn: () => {
      const child = new FakeChild();
      children.push(child);
      return child.asProcess();
    },
    platform: "linux",
    ...overrides,
  });

describe("terminalCommand", () => {
  it("uses PowerShell on Windows and bash elsewhere", () => {
    expect(terminalCommand("win32")).toMatchObject({ command: "powershell.exe", label: "PowerShell" });
    expect(terminalCommand("win32").args).toContain("-NoExit");
    expect(terminalCommand("linux")).toMatchObject({ command: "/bin/bash", label: "bash" });
    expect(terminalCommand("linux").args).toContain("-i");
  });

  it("never builds a command line out of user text", () => {
    const { args } = terminalCommand("win32");
    expect(args.join(" ")).not.toContain(";");
    expect(args.join(" ")).not.toContain("$(");
  });
});

describe("TerminalManager", () => {
  it("creates an opaque session and reports its shell", () => {
    const children: FakeChild[] = [];
    const manager = managerWith(children);
    const created = manager.create();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.shell).toBe("bash");
    expect(manager.count).toBe(1);
    manager.closeAll();
    expect(children[0].killed).toBe(true);
  });

  it("writes input to stdin only, bounded", () => {
    const children: FakeChild[] = [];
    const manager = managerWith(children);
    const created = manager.create();
    if (!created.ok) throw new Error("create failed");
    expect(manager.input(created.id, "echo hello\n")).toEqual({ ok: true });
    expect(children[0].typed()).toBe("echo hello\n");
    expect(manager.input(created.id, "x".repeat(MAX_INPUT_CHARS + 1)).ok).toBe(false);
    expect(children[0].typed()).toBe("");
    manager.closeAll();
  });

  it("streams stdout, stderr and lifecycle notices to subscribers", () => {
    const children: FakeChild[] = [];
    const manager = managerWith(children);
    const created = manager.create();
    if (!created.ok) throw new Error("create failed");
    const chunks: string[] = [];
    manager.subscribe(created.id, (chunk) => chunks.push(`${chunk.stream}:${chunk.text}`));
    children[0].stdout.write("hello");
    children[0].stderr.write("oops");
    expect(chunks.some((line) => line === "stdout:hello")).toBe(true);
    expect(chunks.some((line) => line === "stderr:oops")).toBe(true);
    expect(chunks.some((line) => line.startsWith("system:[已连接"))).toBe(true);
    children[0].emit("exit", 0);
    expect(chunks.some((line) => line.includes("终端已退出"))).toBe(true);
    expect(manager.count).toBe(0);
    expect(manager.subscribe(created.id, () => {})).toBeNull();
  });

  it("caps sessions, closes one, and refuses input afterwards", () => {
    const children: FakeChild[] = [];
    const manager = managerWith(children, { maxSessions: 2 });
    const first = manager.create();
    const second = manager.create();
    expect(first.ok && second.ok).toBe(true);
    const third = manager.create();
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toContain("最多 2 个");
    if (!first.ok) throw new Error("create failed");
    expect(manager.close(first.id)).toBe(true);
    expect(manager.close(first.id)).toBe(false);
    expect(manager.input(first.id, "echo again")).toEqual({ ok: false, error: "TERMINAL_CLOSED" });
    manager.closeAll();
    expect(manager.count).toBe(0);
    expect(children).toHaveLength(2);
  });

  it("reaps idle sessions and reports how many it closed", () => {
    const manager = managerWith([], { idleMs: 1_000 });
    const created = manager.create();
    if (!created.ok) throw new Error("create failed");
    const session = manager.get(created.id);
    session!.lastActivity = 1;
    expect(manager.reap(100_000)).toBe(1);
    expect(manager.count).toBe(0);
    expect(manager.reap(100_000)).toBe(0);
  });

  it("reports a spawn failure instead of throwing", () => {
    const manager = new TerminalManager({
      platform: "linux",
      spawn: () => { throw new Error("no shell on this host"); },
    });
    expect(manager.create()).toEqual({ ok: false, error: "无法启动终端：no shell on this host" });
    expect(manager.count).toBe(0);
  });

  it("keeps the default cap at the documented value", () => {
    expect(MAX_TERMINAL_SESSIONS).toBe(4);
  });
});
