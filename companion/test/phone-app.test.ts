import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { createProxyHandler } from "../src/proxy.ts";
import { PHONE_APP_HTML, PHONE_APP_PATH } from "../src/phone-app.ts";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((done) => {
    server.closeAllConnections();
    server.close(() => done());
  })));
});

const listen = (server: Server): Promise<number> => new Promise((resolve) => {
  servers.push(server);
  server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
});

interface Fixture {
  base: string;
  handler: ReturnType<typeof createProxyHandler>;
  seen: Array<{ method: string; path: string }>;
  setCapability(allowed: boolean): void;
  setPairing(valid: boolean): void;
}

async function fixture(): Promise<Fixture> {
  const seen: Array<{ method: string; path: string }> = [];
  let capability = true;
  let valid = true;
  const upstream = createServer((req, res) => {
    seen.push({ method: req.method ?? "", path: req.url ?? "" });
    if ((req.url ?? "").includes("/stream")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"stream":"stdout","text":"hello"}\n\n');
      return;
    }
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0", shell: "bash", seen: req.method }));
  });
  const upstreamPort = await listen(upstream);
  const handler = createProxyHandler({
    harnessPort: upstreamPort,
    authenticate: (token) => token === "fixture-token" && valid
      ? { id: "fixture-phone", cloudDesktopAccess: capability, browserControlAccess: false }
      : null,
    redeem: () => ({ error: "offline fixture" }),
    serverName: () => "Synthetic computer",
  });
  const relayPort = await listen(createServer(handler));
  return {
    base: `http://127.0.0.1:${relayPort}`,
    handler,
    seen,
    setCapability: (allowed) => { capability = allowed; },
    setPairing: (paired) => { valid = paired; },
  };
}

const auth = { authorization: "Bearer fixture-token" };
const sessionId = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
/** Node's fetch types Response.json() as unknown. */
const readJson = async <T>(response: Response): Promise<T> => (await response.json()) as T;

describe("the phone workbench page", () => {
  it("is served without a token, an account or a third-party script", async () => {
    const { base } = await fixture();
    const response = await fetch(`${base}${PHONE_APP_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toBe(PHONE_APP_HTML);
    expect(html).toContain("手机工作台");
    expect(html).toContain("/api/terminal/sessions");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toContain("fixture-token");
  });

  it("stays closed to a foreign Origin", async () => {
    const { base } = await fixture();
    const foreign = await fetch(`${base}${PHONE_APP_PATH}`, { headers: { origin: "https://evil.example" } });
    expect(foreign.status).toBe(403);
    expect((await readJson<{ error: string }>(foreign)).error).toContain("cross-origin");
  });
});

describe("terminal requests from the browser page", () => {
  it("forwards the page's own Origin only when it matches Host", async () => {
    const { base, seen } = await fixture();
    const wrongHost = await fetch(`${base}/api/terminal/sessions`, {
      method: "POST",
      headers: { ...auth, origin: "http://127.0.0.1:1" },
      body: "{}",
    });
    expect(wrongHost.status).toBe(403);
    expect(seen).toHaveLength(0);

    const baseUrl = new URL(base);
    const own = await fetch(`${base}/api/terminal/sessions`, {
      method: "POST",
      headers: { ...auth, origin: baseUrl.origin, "content-type": "application/json" },
      body: "{}",
    });
    expect(own.status).toBe(201);
    expect((await readJson<{ shell: string }>(own)).shell).toBe("bash");
    expect(seen).toEqual([{ method: "POST", path: "/api/terminal/sessions" }]);
  });

  it("refuses a device whose computer access is off, before touching the harness", async () => {
    const { base, seen, setCapability } = await fixture();
    setCapability(false);
    for (const [method, path] of [
      ["POST", "/api/terminal/sessions"],
      ["GET", `/api/terminal/sessions/${sessionId}/stream`],
      ["DELETE", `/api/terminal/sessions/${sessionId}`],
    ] as Array<[string, string]>) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: auth,
        body: method === "POST" ? "{}" : undefined,
      });
      expect(response.status, `${method} ${path}`).toBe(403);
      expect((await readJson<{ error: string }>(response)).error).toContain("computer access is off");
    }
    expect(seen).toHaveLength(0);
  });

  it("refuses a revoked device whose stream headers are already on the way", async () => {
    const { base, setPairing } = await fixture();
    const stream = await fetch(`${base}/api/terminal/sessions/${sessionId}/stream`, {
      headers: auth,
      signal: AbortSignal.timeout(3_000),
    });
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    setPairing(false);
    // A capability re-check also runs before JSON bodies are forwarded.
    const refused = await fetch(`${base}/api/terminal/sessions`, {
      method: "POST",
      headers: auth,
      body: "{}",
    });
    expect(refused.status).toBe(401);
    await stream.body?.cancel();
  });

  it("closes an open terminal stream when the device is disconnected", async () => {
    const { base, handler } = await fixture();
    const stream = await fetch(`${base}/api/terminal/sessions/${sessionId}/stream`, {
      headers: auth,
      signal: AbortSignal.timeout(3_000),
    });
    expect(stream.status).toBe(200);
    handler.disconnectDevice("fixture-phone");
    const reader = stream.body!.getReader();
    // A destroyed socket can surface as `done: true` or as a read rejection;
    // either means the revoked device stopped receiving.
    const outcome = await Promise.race([
      reader.read().then(() => "closed", () => "closed"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still open"), 2_500)),
    ]);
    expect(outcome).toBe("closed");
  });
});
