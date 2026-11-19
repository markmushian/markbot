// The sidecar now serves one page of its own at /app. Native clients send no
// Origin; a browser loading that page sends one on every write. This keeps the
// original "a browser is not a native app" refusal for foreign pages while
// letting the page we served call its own API.
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

/** Hosts we can prove are not a public domain someone else could rebind:
 * IP literals, localhost and mDNS names. A hosted HTTPS endpoint is added by
 * the caller from the advertised endpoint list, never guessed from Host. */
function localAuthority(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(name)) return true;
  return name === "localhost" || name === "localhost." || name.endsWith(".local");
}

/** Normalized host + port, so `http://x:80` and a `Host: x` match. */
function authorityOf(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed.host.toLowerCase();
  } catch {
    return null;
  }
}

/** True when a request carrying an Origin is the page this sidecar served.
 * Requires an exact authority match against Host, plus either a local Host or
 * an origin the desktop itself advertised. A stolen Host/DNS name on the
 * public internet therefore stays refused. */
export function sameOriginPageRequest(
  headers: IncomingMessage["headers"],
  advertisedOrigins: readonly string[] = [],
): boolean {
  const origin = headers.origin;
  if (!origin || Array.isArray(origin)) return false;
  if (origin === "null") return false;

  const host = headers.host;
  if (!host || Array.isArray(host)) return false;
  const authority = authorityOf(`http://${host}`);
  const originAuthority = authorityOf(origin);
  if (!authority || !originAuthority || authority !== originAuthority) return false;

  const hostname = (() => {
    try { return new URL(`http://${host}`).hostname.toLowerCase(); }
    catch { return ""; }
  })();
  if (localAuthority(hostname)) return true;

  const normalized = origin.toLowerCase().replace(/\/$/, "");
  return advertisedOrigins.some((candidate) => {
    try { return new URL(candidate).origin.toLowerCase() === normalized; }
    catch { return false; }
  });
}
