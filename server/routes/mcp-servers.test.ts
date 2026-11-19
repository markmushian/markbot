import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { DATA_DIR, type AppConfig } from "../config.ts";
import { json, readBody } from "../harness/http.ts";
import type { TeamConnectionsHost } from "../host/team-connections-host.ts";
import { McpOAuthManager } from "../mcp-oauth.ts";
import { listMcpServers } from "../mcp-registry.ts";
import { createMcpServerRoutes } from "./mcp-servers.ts";
import { dispatchRoutes } from "./table.ts";

let server: Server | undefined;
afterEach(async () => {
  const active = server;
  server = undefined;
  if (active) await new Promise<void>((resolve, reject) => active.close((error) => error ? reject(error) : resolve()));
});

async function serve() {
  const cfg: Pick<AppConfig, "mcpServers"> = { mcpServers: {} };
  let busy = false;
  const route = createMcpServerRoutes({
    cfg,
    sessions: { isLive: () => true },
    mcpOAuth: new McpOAuthManager({ file: join(DATA_DIR, "mcp-route-oauth.json") }),
    teamConnections: { personMcp: () => ["private"], people: {} as TeamConnectionsHost["people"] },
    cloudHome: null,
    fallbackPublicUrl: null,
    mcpConfigBusy: { get: () => busy, set: (value) => { busy = value; } },
    mcpServerResponse: () => ({ servers: listMcpServers(cfg.mcpServers) }),
    mcpPolicyRefusal: () => undefined,
    persistMcpServers: (next) => { cfg.mcpServers = next; },
    savedCustomDomain: () => null,
  });
  const active = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    await dispatchRoutes([route], {
      req, res, url, path: url.pathname, method: req.method ?? "GET",
      auth: { kind: "loopback", scopes: ["admin", "client"] }, json, readBody,
    });
  });
  server = active;
  await new Promise<void>((ready) => active.listen(0, "127.0.0.1", ready));
  const base = `http://127.0.0.1:${(active.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return { cfg, post, get: () => fetch(`${base}/api/mcp/servers`) };
}

it.each([["private", "person"], ["public", "team"]])("lists the scope of %s in reads and mutation responses", async (name, scope) => {
  const { post, get } = await serve();
  const response = await post("/api/mcp/servers", { name, url: "https://mail.example.com/mcp", headers: { Authorization: "" } });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ servers: [{ name, scope }] });
  expect(await (await get()).json()).toMatchObject({ servers: [{ name, scope }] });
});

it.each(["create", "import"])("rejects personal header values on %s without saving any server", async (action) => {
  const { cfg, post } = await serve();
  const entry = { url: "https://mail.example.com/mcp", headers: { Authorization: "Bearer private-secret" } };
  const response = action === "create"
    ? await post("/api/mcp/servers", { name: "private", ...entry })
    : await post("/api/mcp/servers/import", { json: JSON.stringify({ mcpServers: { public: { url: "https://public.example.com/mcp" }, private: entry } }) });

  expect(response.status).toBe(400);
  const body = await response.json() as { error: string };
  expect(body.error).toMatch(/personal.*header|header.*personal/i);
  expect(JSON.stringify(body)).not.toContain("private-secret");
  expect(cfg.mcpServers).toEqual({});
});

/** The settings dialog never sees a saved secret, so its route has to put each value back where its marker was. */
describe("POST /api/mcp/servers/:name/credentials", () => {
  const preset = () => ({
    demo: {
      command: "npx",
      args: ["-y", "demo-mcp", "--token=REPLACE_DEMO_TOKEN"],
      env: { DEMO_ID: "REPLACE_DEMO_ID" },
      enabled: false,
    },
    remote: {
      type: "http", url: "https://mcp.example.com/mcp",
      headers: { Authorization: "Bearer REPLACE_DEMO_HEADER" }, enabled: false,
    },
  });

  it("lists the fields to fill without ever echoing a value", async () => {
    const { cfg, get } = await serve();
    cfg.mcpServers = preset();
    const listing = await (await get()).json() as { servers: Array<{ name: string; credentials: Array<{ token: string; filled: boolean }> }> };
    expect(listing.servers.find((server) => server.name === "demo")?.credentials).toMatchObject([
      { token: "DEMO_ID", filled: false }, { token: "DEMO_TOKEN", filled: false },
    ]);
    expect(JSON.stringify(listing)).not.toContain("Bearer REPLACE_DEMO_HEADER");
  });

  it("writes env, argv and header values, keeps the others on a later edit, and echoes no secret", async () => {
    const { cfg, post, get } = await serve();
    cfg.mcpServers = preset();
    const first = await post("/api/mcp/servers/demo/credentials", { values: { DEMO_ID: "id-1", DEMO_TOKEN: "tok-1" } });
    expect(first.status).toBe(200);
    expect(cfg.mcpServers?.demo).toMatchObject({ env: { DEMO_ID: "id-1" }, args: ["-y", "demo-mcp", "--token=tok-1"] });
    expect(JSON.stringify(await first.json())).not.toContain("tok-1");

    const remote = await post("/api/mcp/servers/remote/credentials", { values: { DEMO_HEADER: "hdr-1" } });
    expect(remote.status).toBe(200);
    expect(cfg.mcpServers?.remote).toMatchObject({ headers: { Authorization: "Bearer hdr-1" } });

    const second = await post("/api/mcp/servers/demo/credentials", { values: { DEMO_TOKEN: "tok-2" } });
    expect(second.status).toBe(200);
    expect(cfg.mcpServers?.demo).toMatchObject({ env: { DEMO_ID: "id-1" }, args: ["-y", "demo-mcp", "--token=tok-2"] });
    const listing = await (await get()).json() as { servers: Array<{ name: string; args?: string[]; maskedArgs?: boolean; credentials: Array<{ filled: boolean }> }> };
    const demo = listing.servers.find((server) => server.name === "demo");
    expect(demo?.credentials.every((field) => field.filled)).toBe(true);
    expect(demo?.maskedArgs).toBe(true);
    expect(JSON.stringify(listing)).not.toContain("tok-2");
    expect(JSON.stringify(listing)).not.toContain("hdr-1");
  });

  it.each([
    ["an unknown token", { OTHER: "value" }],
    ["an empty body", {}],
    ["a placeholder as the value", { DEMO_ID: "REPLACE_DEMO_ID" }],
    ["a multiline value", { DEMO_ID: "one\ntwo" }],
  ])("rejects %s without changing the entry", async (_why, values) => {
    const { cfg, post } = await serve();
    cfg.mcpServers = preset();
    const before = JSON.stringify(cfg.mcpServers);
    const response = await post("/api/mcp/servers/demo/credentials", { values });
    expect(response.status).toBe(400);
    expect(JSON.stringify(cfg.mcpServers)).toBe(before);
  });

  it("returns 404 for a server that is not configured", async () => {
    const { post } = await serve();
    const response = await post("/api/mcp/servers/missing/credentials", { values: { DEMO_ID: "x" } });
    expect(response.status).toBe(404);
  });
});

it.each(["create", "import"])("accepts blank personal headers on %s and retains team header values", async (action) => {
  const { cfg, post } = await serve();
  for (const [name, value] of [["private", ""], ["public", "Bearer team-secret"]] as const) {
    const entry = { type: "http", url: "https://mail.example.com/mcp", headers: { Authorization: value } };
    const response = action === "create"
      ? await post("/api/mcp/servers", { name, ...entry })
      : await post("/api/mcp/servers/import", { json: JSON.stringify({ mcpServers: { [name]: entry } }) });
    expect(response.status).toBe(201);
    expect(cfg.mcpServers?.[name]).toMatchObject({ headers: { Authorization: value } });
  }
});
