import { runtimeError } from "../../shared/runtime-codes.ts";
import { ownerOrAdmin } from "../request-auth.ts";
import type { TerminalManager } from "../remote-terminal.ts";
import { PASS, type RouteHandler } from "./table.ts";

const SESSION = /^\/api\/terminal\/sessions\/([0-9a-f-]{36})$/;
const INPUT = /^\/api\/terminal\/sessions\/([0-9a-f-]{36})\/input$/;
const STREAM = /^\/api\/terminal\/sessions\/([0-9a-f-]{36})\/stream$/;

/** Four narrow verbs. Input goes to the shell's stdin, never to a command line.
 * The stream is SSE so a paired phone (whose token lives in a header) can read
 * it with fetch instead of EventSource.
 */
export function createTerminalRoutes(manager: TerminalManager): RouteHandler {
  return async (ctx) => {
    const { method, path, req, res, json, readBody, auth } = ctx;

    // A shell is the widest thing in this process. Guests and chat-only
    // sessions never reach it, even though the companion allowlist opens the
    // path shape. Service-trust loopback is already stopped by the auth gate.
    const terminalPath = /^\/api\/terminal\/sessions(?:\/[0-9a-f-]{36}(?:\/(?:input|stream))?)?$/.test(path);
    if (terminalPath && !ownerOrAdmin(auth)) {
      return json(res, 403, { error: runtimeError("TERMINAL_NOT_PAIRED").message, code: "TERMINAL_NOT_PAIRED" });
    }

    if (method === "POST" && path === "/api/terminal/sessions") {
      const created = manager.create();
      // A full house and a failed spawn are both real answers, not "closed":
      // keep the manager's own explanation rather than mislabelling it.
      if (!created.ok) return json(res, 429, { error: created.error });
      return json(res, 201, { id: created.id, shell: created.shell });
    }

    const inputMatch = method === "POST" ? INPUT.exec(path) : null;
    if (inputMatch) {
      const body = await readBody(req) as { text?: unknown } | null;
      if (typeof body?.text !== "string" || !body.text) return json(res, 400, { error: "需要 text 字段。" });
      const result = manager.input(inputMatch[1]!, body.text);
      if (!result.ok) {
        if (result.error === "TERMINAL_CLOSED") {
          const error = runtimeError("TERMINAL_CLOSED");
          return json(res, 410, { error: error.message, code: error.code });
        }
        // Oversized input is the caller's mistake, not an authorization one.
        return json(res, 400, { error: result.error });
      }
      return json(res, 200, { ok: true });
    }

    const streamMatch = method === "GET" ? STREAM.exec(path) : null;
    if (streamMatch) {
      const id = streamMatch[1]!;
      // Check before headers: subscribing emits its first frame immediately,
      // and a write before writeHead would pin the wrong status and headers.
      if (!manager.get(id)) {
        return json(res, 404, { error: runtimeError("TERMINAL_CLOSED").message, code: "TERMINAL_CLOSED" });
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      const unsubscribe = manager.subscribe(id, (chunk) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      });
      if (!unsubscribe) { res.end(); return; }
      const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, 15_000);
      await new Promise<void>((resolve) => {
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          clearInterval(heartbeat);
          unsubscribe();
          resolve();
        };
        req.once("close", done);
        res.once("close", done);
      });
      return;
    }

    const closeMatch = method === "DELETE" ? SESSION.exec(path) : null;
    if (closeMatch) {
      const closed = manager.close(closeMatch[1]!);
      return json(res, closed ? 200 : 404, { ok: closed });
    }

    return PASS;
  };
}
