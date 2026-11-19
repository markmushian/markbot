import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { resolveSavablePath, withSavableFile } from "./save-file.mjs";

let home;
let currentData;
let legacyData;

before(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "markbot-save-file-"));
  currentData = path.join(home, ".markbot-oss");
  legacyData = path.join(home, ".markbot");
  fs.mkdirSync(path.join(currentData, "workspaces", "bot"), { recursive: true });
  fs.mkdirSync(legacyData, { recursive: true });
  fs.writeFileSync(path.join(currentData, "workspaces", "bot", "report.docx"), "current");
  fs.writeFileSync(path.join(legacyData, "legacy.txt"), "legacy");
  fs.writeFileSync(path.join(home, "secret.txt"), "private");
});

after(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

describe("Mark Bot's data directory is savable", () => {
  it("accepts a file under the current .markbot-oss data directory", async () => {
    const file = path.join(currentData, "workspaces", "bot", "report.docx");
    assert.equal(await resolveSavablePath(file, { home }), await fs.promises.realpath(file));
  });

  it("keeps accepting legacy .markbot files", async () => {
    const file = path.join(legacyData, "legacy.txt");
    assert.equal(await resolveSavablePath(file, { home }), await fs.promises.realpath(file));
  });

  it("accepts .markbot-oss when no legacy data directory exists", async (t) => {
    const freshHome = fs.mkdtempSync(path.join(os.tmpdir(), "markbot-fresh-home-"));
    t.after(() => fs.rmSync(freshHome, { recursive: true, force: true }));
    const data = path.join(freshHome, ".markbot-oss");
    const file = path.join(data, "report.txt");
    fs.mkdirSync(data);
    fs.writeFileSync(file, "fresh");
    assert.equal(await resolveSavablePath(file, { home: freshHome }), await fs.promises.realpath(file));
  });

  it("copies from the current data directory through the validated handle", async () => {
    const source = path.join(currentData, "workspaces", "bot", "report.docx");
    const destination = path.join(home, "copied-report.docx");
    await withSavableFile(source, { home }, ({ copyTo }) => copyTo(destination));
    assert.equal(fs.readFileSync(destination, "utf8"), "current");
  });

  it("still rejects files outside both data directories", async () => {
    await assert.rejects(resolveSavablePath(path.join(home, "secret.txt"), { home }), {
      message: "Only files created by your bots can be saved",
    });
    await assert.rejects(resolveSavablePath(path.join(currentData, "..", "secret.txt"), { home }), {
      message: "Only files created by your bots can be saved",
    });
  });

  it("rejects a symlink inside the current data directory pointing outside it", { skip: !canSymlink() }, async () => {
    const file = path.join(currentData, "workspaces", "bot", "escape.txt");
    fs.symlinkSync(path.join(home, "secret.txt"), file);
    try {
      await assert.rejects(resolveSavablePath(file, { home }), {
        message: "Only files created by your bots can be saved",
      });
    } finally {
      fs.rmSync(file);
    }
  });
});

function canSymlink() {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "markbot-symlink-probe-"));
  try {
    fs.symlinkSync(probe, path.join(probe, "link"));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
}
