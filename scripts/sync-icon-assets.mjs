// One icon edit has to reach every copy a person can launch from. Vite copies public/ into
// dist/ on build, but the packaged release folders keep the UI they were built with, so a
// rebuilt avatar can stay invisible in release-vN forever. Run `pnpm sync:icons` after
// changing anything in public/model-avatars/ or the app/tray icons.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const avatarDir = join(publicDir, "model-avatars");

const assets = [
  ...readdirSync(avatarDir).filter((name) => name.endsWith(".png")).map((name) => `model-avatars/${name}`),
  "app-icon-192.png",
  "app-icon-512.png",
  "apple-touch-icon.png",
  "tray-icon.png",
  "tray-icon.ico",
];

const targets = [join(root, "dist")];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^release(?:-v\d+)?$/.test(entry.name)) continue;
  const ui = join(root, entry.name, "win-unpacked", "resources", "ui");
  if (existsSync(ui)) targets.push(ui);
}

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
let copied = 0;
const failures = [];

for (const target of targets) {
  const label = relative(root, target) || "dist";
  for (const asset of assets) {
    const from = join(publicDir, asset);
    if (!existsSync(from)) {
      failures.push(`${asset}: missing in public/`);
      continue;
    }
    const to = join(target, asset);
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(to) && sha256(from) === sha256(to)) continue;
    try {
      copyFileSync(from, to);
      if (sha256(from) !== sha256(to)) throw new Error("checksum mismatch");
      copied += 1;
    } catch (error) {
      failures.push(`${label}/${asset}: ${error.message}`);
    }
  }
  console.log(`[sync-icons] ${label}: ${assets.length} icon assets verified`);
}

if (failures.length > 0) {
  console.error(`[sync-icons] ${failures.join("; ")}`);
  process.exit(1);
}
console.log(`[sync-icons] ${copied} file(s) updated across ${targets.length} UI bundle(s)`);
