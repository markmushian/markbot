import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const sourcePath = path.resolve(rootDir, process.argv[2] || "release-v08/win-unpacked/Mark Bot.exe");
const iconPath = path.resolve(rootDir, "build/markbot.ico");
const temporaryPath = `${sourcePath}.metadata.tmp`;

const pnpmRoot = path.join(rootDir, "node_modules/.pnpm");
const packageRoot = (name) => {
  const directory = fs.readdirSync(pnpmRoot).find((entry) => entry.startsWith(`${name}@`));
  if (!directory) throw new Error(`缺少打包依赖：${name}`);
  return path.join(pnpmRoot, directory, "node_modules", name);
};
const peLibrary = require(packageRoot("pe-library"));
const resEdit = require(packageRoot("resedit"));

const executable = peLibrary.NtExecutable.from(fs.readFileSync(sourcePath));
const resources = peLibrary.NtExecutableResource.from(executable);

const icon = resEdit.Data.IconFile.from(fs.readFileSync(iconPath));
resEdit.Resource.IconGroupEntry.replaceIconsForResource(
  resources.entries,
  101,
  1033,
  icon.icons.map((item) => item.data),
);

const versionInfo = resEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
if (!versionInfo) throw new Error("Mark Bot.exe 中没有可编辑的版本信息");

versionInfo.setFileVersion(0, 6, 0, 0, 1033);
versionInfo.setProductVersion(0, 6, 0, 0, 1033);
versionInfo.setStringValues(
  { lang: 1033, codepage: 1200 },
  {
    CompanyName: "Mark Bot",
    FileDescription: "Mark Bot 中文智能助手",
    InternalName: "Mark Bot",
    LegalCopyright: "Copyright © 2026 Mark Bot",
    OriginalFilename: "Mark Bot.exe",
    ProductName: "Mark Bot",
  },
);
versionInfo.outputToResourceEntries(resources.entries);

resources.outputResource(executable);
fs.writeFileSync(temporaryPath, Buffer.from(executable.generate()));
fs.renameSync(temporaryPath, sourcePath);
console.log(`已修复 Windows 图标和版本信息：${sourcePath}`);
