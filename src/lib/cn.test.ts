// `cn` is where the type scale survives contact with tailwind-merge. A bare
// `text-<word>` is a colour to tailwind-merge unless the word is a known size, so an
// unregistered `text-ui` lost to a following `text-ink` and the font size silently
// disappeared across the app. This locks the scale in as font sizes.
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

describe("cn keeps the type scale and colours independent", () => {
  it("keeps a size that sits before a colour", () => {
    expect(cn("text-ui", "text-ink")).toBe("text-ui text-ink");
  });

  it("keeps a size that sits after a colour", () => {
    expect(cn("text-ink", "text-note")).toBe("text-ink text-note");
  });

  it("still drops a duplicate size, and a duplicate colour", () => {
    expect(cn("text-ui", "text-note")).toBe("text-note");
    expect(cn("text-ink", "text-ink-secondary")).toBe("text-ink-secondary");
  });

  it("knows the whole scale", () => {
    for (const size of ["text-micro", "text-tiny", "text-meta", "text-note", "text-ui", "text-body", "text-lead", "text-title", "text-page", "text-subtitle", "text-h3", "text-h2", "text-h1", "text-display", "text-hero"]) {
      expect(cn(size, "text-ink")).toContain(size);
    }
  });
});
