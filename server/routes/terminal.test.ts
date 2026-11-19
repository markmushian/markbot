import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { json, readBody } from "../harness/http.ts";
import { TerminalManager } from "../remote-terminal.ts";
import type { RequestAuth } from "../request-auth.ts";
import { createTerminalRoutes } from "./terminal.ts";
import { dispatchRoutes } from "./table.ts";

class FakeChild extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  kill(): boolean { return true; }
  asProcess(): ChildProcessWithoutNullStreams {
    return this as unknown as ChildProcessWithoutNullStreams;
  }
}

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => {
    server.closeAllConnections();
    server.close(() => done());
  })));
});

const owner: RequestAuth = { kind: "loopback", scopes: ["admin", "client"] };
const guest: RequestAuth = { kind: "session", session: {} as never, via: "bearer", scopes: ["client"] };

async function serve(auth: RequestAuth = owner, maxSessions = 4): Promise<{ base: string; manager: TerminalManager; children: FakeChild[] }> {
  const children: FakeChild[] = [];
  const manager = new TerminalManager({
    platform: "linux",
    maxSessions,
    spawn: () => {
      const child = new FakeChild();
      children.push(child);
      return child.asProcess();
    },
  });
  const routes = [createTerminalRoutes(manager)];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const handled = await dispatchRoutes(routes, {
      req, res, url, path: url.pathname, method: req.method ?? "GET", auth, json, readBody,
    });
    if (!handled) json(res, 404, { from: "inline routes" });
  });
  servers.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, manager, children };
}

const readJson = async <T = Record<string, unknown>>(response: Response): Promise<T> =>
  (await response.json()) as T;

const post = (url: string, body?: unknown) => fetch(url, {
  method: "POST",
  headers: body === undefined ? {} : { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe("interactive terminal routes", () => {
  it("creates, writes to, streams from and closes one shell session", async () => {
    const { base, manager, children } = await serve();
    const created = await post(`${base}/api/terminal/sessions`, {});
    expect(created.status).toBe(201);
    const { id, shell } = await readJson<{ id: string; shell: string }>(created);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(shell).toBe("bash");

    const written = await post(`${base}/api/terminal/sessions/${id}/input`, { text: "echo phone\n" });
    expect(written.status).toBe(200);
    expect(String(children[0].stdin.read()?.toString("utf8"))).toBe("echo phone\n");

    const controller = new AbortController();
    const stream = await fetch(`${base}/api/terminal/sessions/${id}/stream`, { signal: controller.signal });
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const first = await stream.body!.getReader().read();
    expect(new TextDecoder().decode(first.value)).toContain("[已连接");
    controller.abort();

    const closed = await fetch(`${base}/api/terminal/sessions/${id}`, { method: "DELETE" });
    expect(await readJson(closed)).toEqual({ ok: true });
    expect(manager.count).toBe(0);
    expect(await fetch(`${base}/api/terminal/sessions/${id}`, { method: "DELETE" })).toHaveProperty("status", 404);
  });

  it("refuses missing or oversized input, and a closed session", async () => {
    const { base, manager } = await serve();
    const created = await post(`${base}/api/terminal/sessions`, {});
    const { id } = await readJson<{ id: string }>(created);
    const missing = await post(`${base}/api/terminal/sessions/${id}/input`, {});
    expect(missing.status).toBe(400);
    expect(await readJson(missing)).toMatchObject({ error: "需要 text 字段。" });

    const huge = await post(`${base}/api/terminal/sessions/${id}/input`, { text: "x".repeat(4_097) });
    expect(huge.status).toBe(400);
    expect((await readJson<{ error: string }>(huge)).error).toContain("4096");

    manager.close(id);
    const gone = await post(`${base}/api/terminal/sessions/${id}/input`, { text: "echo x" });
    expect(gone.status).toBe(410);
    expect((await readJson<{ code: string }>(gone)).code).toBe("TERMINAL_CLOSED");
    const stream = await fetch(`${base}/api/terminal/sessions/${id}/stream`);
    expect(stream.status).toBe(404);
    expect((await readJson<{ code: string }>(stream)).code).toBe("TERMINAL_CLOSED");
  });

  it("returns 429 with a runtime code when the session cap is reached", async () => {
    const { base } = await serve(owner, 1);
    expect((await post(`${base}/api/terminal/sessions`, {})).status).toBe(201);
    const refused = await post(`${base}/api/terminal/sessions`, {});
    expect(refused.status).toBe(429);
    expect((await readJson<{ error: string }>(refused)).error).toContain("最多 1 个");
  });

  it("never answers a guest or a chat-only session", async () => {
    const { base, manager } = await serve(guest);
    for (const [method, path] of [
      ["POST", "/api/terminal/sessions"],
      ["GET", "/api/terminal/sessions/00000000-0000-0000-0000-000000000000/stream"],
    ] as const) {
      const response = await fetch(`${base}${path}`, { method, body: method === "POST" ? "{}" : undefined });
      expect(response.status).toBe(403);
      expect((await readJson<{ code: string }>(response)).code).toBe("TERMINAL_NOT_PAIRED");
    }
    expect(manager.count).toBe(0);
  });

  it("declines unknown paths and verbs so the next route can answer", async () => {
    const { base } = await serve();
    const unknown = await fetch(`${base}/api/terminal/sessions/not-a-uuid/exec`);
    expect(await readJson(unknown)).toEqual({ from: "inline routes" });
    const badVerb = await fetch(`${base}/api/terminal/sessions`, { method: "PATCH" });
    expect(await readJson(badVerb)).toEqual({ from: "inline routes" });
  });
});
