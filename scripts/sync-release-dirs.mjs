// After a build, every folder a person might launch from carries the same bytes. This project accumulated
// release-v08…v14 while iterating, and each of them kept the build it was created with, so "I rebuilt it" and "I still
// see the old screen" could both be true. Mirroring here means a shortcut, a pinned taskbar item or a habit of opening
// release-v14 can never show an older build than release/.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "release", "win-unpacked");

if (!existsSync(source)) {
  console.error(`[sync-release] no build at ${source}; run the package step first`);
  process.exit(1);
}

const mirrors = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^release-v\d+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

if (mirrors.length === 0) {
  console.log("[sync-release] no release-vN folders to mirror");
  process.exit(0);
}

const ROBOCOPY_FLAGS = ["/NFL", "/NDL", "/NJH", "/NJS", "/R:1", "/W:1"];
const statusOf = (error) => typeof error?.status === "number" ? error.status : -1;
const failures = [];

// A running Mark Bot locks its own exe/dll. robocopy reports that as bit 8 (exit 8, 9, 10, 11...),
// which used to abort the whole package even though the UI and server bundles had landed. Payload
// verification decides success instead: the launcher's own exe is not what a frontend change ships.
function payloadOf(dir) {
  const ui = join(dir, "resources", "ui");
  const index = join(ui, "index.html");
  const files = [join(dir, "resources", "server", "index.js"), index];
  try {
    const html = readFileSync(index, "utf8");
    for (const match of html.matchAll(/assets\/([A-Za-z0-9._-]+\.(?:js|css))/g)) {
      files.push(join(ui, "assets", match[1]));
    }
  } catch {
    // A missing index.html is reported as a missing payload file below.
  }
  const result = {};
  for (const file of files) {
    const name = relative(dir, file).split("\\").join("/");
    try {
      result[name] = createHash("sha256").update(readFileSync(file)).digest("hex");
    } catch {
      result[name] = null;
    }
  }
  return result;
}

const expected = payloadOf(source);
const verify = (target) => {
  const actual = payloadOf(target);
  return Object.keys(expected).filter((name) => !expected[name] || expected[name] !== actual[name]);
};

for (const name of mirrors) {
  const target = join(root, name, "win-unpacked");
  if (!existsSync(target)) continue;

  // /MIR makes the copy identical, including deletions; robocopy exit codes 0-7 all mean success.
  let locked = false;
  try {
    execFileSync("robocopy", [source, target, "/MIR", ...ROBOCOPY_FLAGS], { stdio: "ignore" });
  } catch (error) {
    const code = statusOf(error);
    if (code >= 0 && code <= 7) {
      console.log(`[sync-release] ${name} <- release`);
      continue;
    }
    locked = true;
  }

  if (locked) {
    // Copy-only retry: never delete, never fail on the exe a running app holds open.
    try {
      execFileSync("robocopy", [source, target, "/E", ...ROBOCOPY_FLAGS], { stdio: "ignore" });
    } catch {
      // The payload check below is authoritative; a locked exe alone is not a failure.
    }
  }

  const stale = verify(target);
  if (stale.length > 0) {
    failures.push(`${name}: ${stale.length} UI/server file(s) differ (${stale.slice(0, 2).join(", ")})`);
    console.log(`[sync-release] ${name} STALE`);
  } else if (locked) {
    console.log(`[sync-release] ${name} <- release (UI/server verified; locked exe skipped)`);
  } else {
    console.log(`[sync-release] ${name} <- release`);
  }
}

if (failures.length > 0) {
  console.error(`[sync-release] ${failures.join("; ")}`);
  process.exit(1);
}
