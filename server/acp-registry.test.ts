import { describe, expect, it } from "vitest";

import { launchFor, normalizeRegistry } from "./acp-registry.ts";

describe("the ACP registry", () => {
  it("turns an npx distribution into the whole command line", () => {
    expect(launchFor({ npx: { package: "@qwen-code/qwen-code@0.26.7", args: ["--acp"] } }))
      .toEqual({ cli: "npx -y @qwen-code/qwen-code@0.26.7 --acp", source: "npx" });
  });

  it("accepts an npx package with no arguments", () => {
    expect(launchFor({ npx: { package: "glm-acp-agent@1.17.0" } }))
      .toEqual({ cli: "npx -y glm-acp-agent@1.17.0", source: "npx" });
  });

  it("falls back to uvx, and drops arguments that are not strings", () => {
    expect(launchFor({ uvx: { package: "some-agent", args: ["acp", "", 7 as never] } }))
      .toEqual({ cli: "uvx some-agent acp", source: "uvx" });
  });

  it("offers nothing for an agent that ships only platform binaries", () => {
    expect(launchFor({ binary: { "win32-x64": { archive: "https://example/a.zip" } } })).toBeNull();
    expect(launchFor({})).toBeNull();
    expect(launchFor(undefined)).toBeNull();
  });

  it("keeps the useful fields, skips nameless entries and sorts by name", () => {
    const agents = normalizeRegistry({
      agents: [
        { id: "z", name: "Zeta", version: "2", description: " d ", icon: "https://i/z.png", distribution: { npx: { package: "z@2" } } },
        { id: "a", name: "Alpha", version: "1", distribution: { binary: { "linux-x64": {} } } },
        { id: "", name: "No id" },
        { id: "b" },
      ],
    });
    expect(agents.map((agent) => agent.id)).toEqual(["a", "z"]);
    expect(agents[1]).toMatchObject({ name: "Zeta", version: "2", description: "d", icon: "https://i/z.png" });
    expect(agents[1]!.launch).toEqual({ cli: "npx -y z@2", source: "npx" });
    expect(agents[0]!.launch).toBeNull();
  });

  it("returns an empty list for a payload that is not a registry", () => {
    expect(normalizeRegistry(null)).toEqual([]);
    expect(normalizeRegistry({ agents: "nope" })).toEqual([]);
    expect(normalizeRegistry({})).toEqual([]);
  });
});
