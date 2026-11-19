import { describe, expect, it } from "vitest";

import { sameOriginPageRequest } from "../src/web-origin.ts";

const headers = (origin?: string, host = "192.168.1.42:8810") => ({
  host,
  ...(origin === undefined ? {} : { origin }),
});

describe("the page served at /app", () => {
  it("has no Origin for a native client, which the proxy allows separately", () => {
    expect(sameOriginPageRequest(headers())).toBe(false);
  });

  it("accepts its own LAN, loopback and mDNS origins", () => {
    expect(sameOriginPageRequest(headers("http://192.168.1.42:8810"))).toBe(true);
    expect(sameOriginPageRequest(headers("http://127.0.0.1:8810", "127.0.0.1:8810"))).toBe(true);
    expect(sameOriginPageRequest(headers("http://localhost:8810", "localhost:8810"))).toBe(true);
    expect(sameOriginPageRequest(headers("http://MacBook.local:8810", "MacBook.local:8810"))).toBe(true);
    expect(sameOriginPageRequest(headers("http://[::1]:8810", "[::1]:8810"))).toBe(true);
  });

  it("refuses a foreign page even when its Host is loopback", () => {
    for (const origin of [
      "https://evil.example",
      "http://127.0.0.1.evil.example",
      "http://localhost:8811",
      "http://192.168.1.43:8810",
      "null",
      "not-a-url",
    ]) {
      expect(sameOriginPageRequest(headers(origin)), origin).toBe(false);
    }
    expect(sameOriginPageRequest(headers("https://evil.example", "evil.example:8810"))).toBe(false);
    expect(sameOriginPageRequest(headers("https://evil.example", "127.0.0.1:8810"))).toBe(false);
  });

  it("refuses a DNS-rebound public Host unless the desktop advertised it", () => {
    const rebound = headers("http://rebound.example:8810", "rebound.example:8810");
    expect(sameOriginPageRequest(rebound)).toBe(false);
    expect(sameOriginPageRequest(rebound, ["https://markbot.example"])).toBe(false);
    expect(sameOriginPageRequest(
      headers("https://markbot.example", "markbot.example"),
      ["https://markbot.example"],
    )).toBe(true);
  });

  it("refuses missing, duplicated or credential-bearing headers", () => {
    expect(sameOriginPageRequest({ origin: "http://192.168.1.42:8810" })).toBe(false);
    expect(sameOriginPageRequest({ host: "192.168.1.42:8810" })).toBe(false);
    expect(sameOriginPageRequest({
      host: "192.168.1.42:8810",
      origin: ["http://192.168.1.42:8810", "https://evil.example"] as unknown as string,
    })).toBe(false);
    expect(sameOriginPageRequest(headers("http://user@192.168.1.42:8810"))).toBe(false);
    expect(sameOriginPageRequest(headers("ftp://192.168.1.42:8810"))).toBe(false);
  });
});
