/** Interactive shell sessions for the desktop and a paired phone.
 *
 * There is deliberately no "run this command" endpoint: the browser opens one
 * shell and then types into its stdin. Nothing from the network is ever
 * interpolated into a command line, so a device cannot turn a terminal session
 * into a remote command runner. Sessions are bounded, idle-reaped and tied to
 * the loopback/companion auth gate that already exists.
 */
import { randomUUID } from "node:crypto";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";

export type Spawner = () => ChildProcessWithoutNullStreams;

export interface TerminalChunk {
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export type TerminalListener = (chunk: TerminalChunk) => void;

export interface TerminalSession {
  id: string;
  shell: string;
  createdAt: number;
  lastActivity: number;
  closed: boolean;
  subscribe(listener: TerminalListener): () => void;
  write(text: string): void;
  close(): void;
}

export const MAX_TERMINAL_SESSIONS = 4;
export const MAX_INPUT_CHARS = 4_096;
export const MAX_OUTPUT_CHARS = 8_192;
export const TERMINAL_IDLE_MS = 10 * 60_000;

export function terminalCommand(platform: NodeJS.Platform = process.platform): { command: string; args: string[]; label: string } {
  if (platform === "win32") return { command: "powershell.exe", args: ["-NoProfile", "-NoLogo", "-NoExit", "-Command", "-"], label: "PowerShell" };
  return { command: "/bin/bash", args: ["--noprofile", "--norc", "-i"], label: "bash" };
}

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly listeners = new Map<string, Set<TerminalListener>>();
  private readonly children = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly maxSessions: number;
  private readonly idleMs: number;
  private readonly spawn: Spawner;
  private readonly label: string;

  constructor(options: { spawn?: Spawner; maxSessions?: number; idleMs?: number; platform?: NodeJS.Platform } = {}) {
    this.maxSessions = options.maxSessions ?? MAX_TERMINAL_SESSIONS;
    this.idleMs = options.idleMs ?? TERMINAL_IDLE_MS;
    const shell = terminalCommand(options.platform);
    this.label = shell.label;
    this.spawn = options.spawn ?? (() => nodeSpawn(shell.command, shell.args, { stdio: ["pipe", "pipe", "pipe"], env: process.env }));
  }

  get count(): number { return this.sessions.size; }
  get shell(): string { return this.label; }

  create(): { ok: true; id: string; shell: string } | { ok: false; error: string } {
    this.reap();
    if (this.sessions.size >= this.maxSessions) return { ok: false, error: `同时最多 ${this.maxSessions} 个终端会话，请先关闭一个。` };
    const id = randomUUID();
    let child: ChildProcessWithoutNullStreams;
    try { child = this.spawn(); }
    catch (cause) { return { ok: false, error: `无法启动终端：${cause instanceof Error ? cause.message : String(cause)}` }; }

    const listeners = new Set<TerminalListener>();
    this.listeners.set(id, listeners);
    this.children.set(id, child);
    const emit = (stream: TerminalChunk["stream"], text: string) => {
      const chunk: TerminalChunk = { stream, text: text.slice(0, MAX_OUTPUT_CHARS) };
      for (const listener of listeners) listener(chunk);
    };

    const session: TerminalSession = {
      id, shell: this.label, createdAt: Date.now(), lastActivity: Date.now(), closed: false,
      subscribe: (listener) => {
        listeners.add(listener);
        emit("system", `[已连接 · ${this.label} · 会话 ${id.slice(0, 8)}]`);
        return () => { listeners.delete(listener); };
      },
      write: (text) => {
        if (session.closed) throw new Error(runtimeTerminalClosed);
        if (typeof text !== "string" || !text) return;
        if (text.length > MAX_INPUT_CHARS) throw new Error(`单次输入不能超过 ${MAX_INPUT_CHARS} 个字符。`);
        session.lastActivity = Date.now();
        child.stdin.write(text);
      },
      close: () => this.close(id),
    };
    this.sessions.set(id, session);

    child.stdout.on("data", (data: Buffer) => emit("stdout", data.toString("utf8")));
    child.stderr.on("data", (data: Buffer) => emit("stderr", data.toString("utf8")));
    child.once("exit", (code) => {
      emit("system", `[终端已退出${code === null ? "" : ` · 代码 ${code}`}]`);
      this.close(id);
    });
    child.once("error", (cause) => { emit("stderr", cause.message); this.close(id); });
    return { ok: true, id, shell: this.label };
  }

  get(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  input(id: string, text: string): { ok: true } | { ok: false; error: string } {
    const session = this.sessions.get(id);
    if (!session || session.closed) return { ok: false, error: "TERMINAL_CLOSED" };
    try { session.write(text); return { ok: true }; }
    catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }; }
  }

  subscribe(id: string, listener: TerminalListener): (() => void) | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    return session.subscribe(listener);
  }

  close(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.closed = true;
    const child = this.children.get(id);
    try { child?.stdin.end(); child?.kill(); } catch { /* already gone */ }
    this.sessions.delete(id);
    this.children.delete(id);
    this.listeners.delete(id);
    return true;
  }

  /** Close sessions nobody has typed into for a while. */
  reap(now = Date.now()): number {
    let closed = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.idleMs) { this.close(id); closed += 1; }
    }
    return closed;
  }

  closeAll(): void {
    // Map iterators tolerate deleting the current entry, which close() does.
    for (const id of this.sessions.keys()) this.close(id);
  }
}

export const runtimeTerminalClosed = "TERMINAL_CLOSED";
