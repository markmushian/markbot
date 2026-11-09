// Design ratchet: the rules that keep the type scale, easing and motion budget
// from drifting back to whatever a model types that day. Every number here may
// only go down, the same way `file-size-ratchet.test.ts` works.
//
//   * Raw `text-[Npx]` is banned outright. Sizes live in `src/styles.css` under
//     `--text-*`, named by the job (text-ui, text-note, text-title …), so a
//     heading and a table label cannot drift apart over time.
//   * Easing is one curve (`ease-standard`) plus the two exits. An inline
//     `ease-[cubic-bezier(…)]` is how a second curve sneaks in.
//   * Keyframes are the motion budget. A new one has to earn its place here.
//
// To lower a number after a cleanup, edit it in place. `scripts/tighten-ratchets.mjs`
// also does it at release time for the line-count ratchet; keep these in step by
// hand when a pass removes keyframes.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const SRC = fileURLToPath(new URL("src/", ROOT));

/** Only these easing utilities exist. `ease-standard` is the house curve;
 *  `ease-in`/`ease-out`/`ease-in-out`/`ease-linear` are the named exceptions. */
const ALLOWED_EASING = new Set(["standard", "in", "out", "in-out", "linear"]);

/** Motion budget in `src/styles.css`. Lower it when a pass retires a keyframe. */
const KEYFRAMES = 64;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === "dist") continue;
      sourceFiles(path, out);
    } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

function readSources(): Array<{ path: string; text: string }> {
  return sourceFiles(SRC).map((path) => ({ path: path.slice(SRC.length), text: readFileSync(path, "utf8") }));
}

describe("design ratchet", () => {
  it("uses the type scale instead of raw pixel sizes", () => {
    const offenders = readSources()
      .map(({ path, text }) => ({
        path,
        hits: [...text.matchAll(/text-\[(\d+px)\]/g)].map((m) => m[0]),
      }))
      .filter((each) => each.hits.length > 0);
    const detail = offenders.map((each) => `${each.path}: ${each.hits.join(", ")}`).join("\n");
    expect(offenders, `raw text-[Npx] must use a --text-* token:\n${detail}`).toEqual([]);
  });

  it("keeps one easing curve and the named exits", () => {
    const bad: string[] = [];
    for (const { path, text } of readSources()) {
      for (const match of text.matchAll(/(?<![\w-])ease-([\w[\]().,/-]+)/g)) {
        const name = match[1];
        // An arbitrary `ease-[…]` is a second curve by definition.
        if (!ALLOWED_EASING.has(name)) bad.push(`${path}: ${match[0]}`);
      }
    }
    expect(bad, `easing must be one of ${[...ALLOWED_EASING].join(", ")}:\n${bad.join("\n")}`).toEqual([]);
  });

  it("does not grow the keyframe budget", () => {
    const css = readFileSync(fileURLToPath(new URL("src/styles.css", ROOT)), "utf8");
    const found = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(found.length, `keyframes: ${found.join(", ")}`).toBeLessThanOrEqual(KEYFRAMES);
  });

  it("keeps one type scale across every skin", () => {
    // `--radius-*` is deliberately redefined per skin, so the radius scale cannot be
    // a global constant and a component that hard-codes one breaks a skin. Type is
    // the opposite: every skin reads the same sizes. A second `--text-*` inside a
    // `[data-skin]` block would fork the scale the same way, and no component could
    // then trust `text-ui` to mean one thing.
    const css = readFileSync(fileURLToPath(new URL("src/styles.css", ROOT)), "utf8");
    const forked: string[] = [];
    for (const match of css.matchAll(/--text-[\w-]+\s*:/g)) {
      // Walk back to the nearest selector: only `@theme {` may declare a size.
      const before = css.slice(0, match.index ?? 0);
      const open = before.lastIndexOf("{");
      const selector = before.slice(Math.max(0, before.lastIndexOf("}", open - 1) + 1), open).trim();
      if (!selector.startsWith("@theme")) forked.push(`${selector} { ${match[0].trim()}`);
    }
    expect(forked, `type sizes may only be declared in @theme:\n${forked.join("\n")}`).toEqual([]);
  });

  it("declares a size for every raw pixel value still in the tree", () => {
    // A raw `text-[13px]` is already banned above. This catches the next habit: a
    // `text-[0.8rem]` or `text-[13.5px]` that slips past the pixel check. Relative
    // `em` values stay legal — a chip that tracks its surrounding text is a
    // deliberate choice, not a size on the scale — and `text-[color:…]` is a color.
    const offenders: string[] = [];
    for (const { path, text } of readSources()) {
      for (const match of text.matchAll(/(?<![\w-])text-\[([^\]]+)\]/g)) {
        const value = match[1];
        if (/^[\d.]+(px|pt|rem)?$/.test(value)) offenders.push(`${path}: ${match[0]}`);
      }
    }
    expect(offenders, `no fixed arbitrary text sizes:\n${offenders.join("\n")}`).toEqual([]);
  });
});
