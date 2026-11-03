import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TEXT_EXTENSIONS = new Set([
  ".cjs", ".css", ".html", ".js", ".json", ".map", ".mjs", ".svg", ".txt", ".yaml", ".yml",
]);
const RUNTIME_DIRECTORIES = ["server", "ui", "companion"];
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_FINDINGS_PER_FILE = 100;

const MARKERS = [
  {
    code: "upstream-domain",
    message: "发布包仍包含上游网络地址",
    pattern: /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*markbot\.com\b/gi,
  },
  {
    code: "upstream-repository",
    message: "发布包仍包含上游仓库地址",
    // The literal upstream path on purpose: this rule exists to catch it leaking into a build, so it must name it.
    pattern: /github\.com\/milind-soni\/OpenMausBot\b/gi,
  },
  {
    code: "upstream-posthog",
    message: "发布包仍包含上游 PostHog 地址",
    pattern: /\bus\.i\.posthog\.com\b/gi,
  },
  {
    code: "analytics-token",
    message: "发布包仍包含 PostHog 项目令牌",
    pattern: /\bphc_[A-Za-z0-9]+\b/g,
  },
  {
    code: "packaged-test-source",
    message: "发布包包含 Node 测试源码",
    pattern: /(?:^|[\\/"'])[^\\/"'\s]+(?:\.node-test\.mjs|\.test\.(?:ts|tsx|js|mjs))\b/g,
  },
];

function relativeFile(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function safeMatch(code, value) {
  return code === "analytics-token" ? "phc_…（已脱敏）" : value;
}

function isExampleUpstream(value) {
  return /^(?:https?:\/\/)?c-(?:example|office|old)\.markbot\.com\b/i.test(value);
}

/** Scan runtime text without exposing credentials in the report. */
export function scanText(text) {
  const findings = [];
  for (const marker of MARKERS) {
    marker.pattern.lastIndex = 0;
    let match;
    let count = 0;
    while ((match = marker.pattern.exec(text)) !== null && count < MAX_FINDINGS_PER_FILE) {
      const before = text.slice(0, match.index);
      const line = before.split("\n").length;
      const lastNewline = before.lastIndexOf("\n");
      findings.push({
        code: marker.code,
        message: marker.message,
        line,
        column: match.index - lastNewline,
        match: safeMatch(marker.code, match[0]),
        severity: marker.code === "upstream-domain" && isExampleUpstream(match[0]) ? "warning" : "error",
      });
      count += 1;
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column || a.code.localeCompare(b.code));
}

function walkFiles(directory) {
  const files = [];
  const skipped = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        skipped.push(file);
      } else if (entry.isDirectory()) {
        visit(file);
      } else if (entry.isFile()) {
        files.push(file);
      }
    }
  }
  visit(directory);
  return { files, skipped };
}

function isTextCandidate(file) {
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase());
}

function readWindowsMetadata(executable) {
  if (process.platform !== "win32") return null;
  const script = [
    "$v = (Get-Item -LiteralPath $env:MARKBOT_RELEASE_EXECUTABLE).VersionInfo",
    "[pscustomobject]@{ ProductName = $v.ProductName; FileVersion = $v.FileVersion; ProductVersion = $v.ProductVersion; CompanyName = $v.CompanyName } | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, MARKBOT_RELEASE_EXECUTABLE: executable },
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) return null;
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    return null;
  }
}

function addError(report, code, message, extra = {}) {
  report.errors.push({ code, message, ...extra });
}

function addWarning(report, code, message, extra = {}) {
  report.warnings.push({ code, message, ...extra });
}

function checkRequiredFile(report, root, relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    addError(report, "missing-runtime-file", `缺少发布运行文件：${relative}`, { file: relative });
    return false;
  }
  return true;
}

function scanFile(report, root, file, { binary = false } = {}) {
  const relative = relativeFile(root, file);
  const size = fs.statSync(file).size;
  if (size > MAX_FILE_BYTES) {
    addWarning(report, "file-too-large", `文件超过扫描上限，未检查：${relative}`, { file: relative });
    return;
  }
  const buffer = fs.readFileSync(file);
  if (!binary && buffer.includes(0)) return;
  report.checkedFiles.push(relative);
  report.scannedBytes += size;
  const grouped = new Map();
  for (const finding of scanText(buffer.toString("utf8"))) {
    const key = `${finding.code}:${finding.severity}`;
    const group = grouped.get(key) ?? { ...finding, occurrences: 0, locations: [] };
    group.occurrences += 1;
    if (group.locations.length < 3) group.locations.push({ line: finding.line, column: finding.column });
    grouped.set(key, group);
  }
  for (const finding of grouped.values()) {
    const add = finding.severity === "warning" ? addWarning : addError;
    const suffix = finding.severity === "warning" ? "（示例地址，需确认来源）" : "";
    add(report, finding.code, `${finding.message}${suffix}`, {
      file: relative,
      line: finding.line,
      column: finding.column,
      match: finding.match,
      occurrences: finding.occurrences,
      locations: finding.locations,
    });
  }
}

function checkExecutable(report, root, options) {
  if (process.platform !== "win32" && !options.metadataReader) return;
  const executables = fs.readdirSync(root).filter((name) => name.toLowerCase().endsWith(".exe"));
  if (executables.length === 0) {
    addError(report, "missing-executable", "发布目录顶层没有 Windows 主程序 .exe");
    return;
  }
  const expectedName = options.expectedExecutableName ?? `${options.expectedProductName}.exe`;
  const executable = executables.includes(expectedName) ? expectedName : executables[0];
  report.executable = executable;
  if (executable !== expectedName) {
    addError(report, "executable-name", `主程序名称应为 ${expectedName}，实际为 ${executable}`, { file: executable });
  }
  if (executables.length > 1) {
    addWarning(report, "multiple-executables", `顶层存在多个 .exe，按 ${executable} 检查`, { files: executables.sort() });
  }
  if (options.skipMetadata) return;
  const metadata = (options.metadataReader ?? readWindowsMetadata)(path.join(root, executable));
  report.metadata = metadata;
  if (!metadata) {
    addWarning(report, "metadata-unavailable", "无法读取主程序版本元数据；可在 Windows 发布环境重试");
    return;
  }
  if (metadata.ProductName !== options.expectedProductName) {
    addError(report, "product-name", `程序 ProductName 应为 ${options.expectedProductName}`, {
      actual: metadata.ProductName ?? null,
    });
  }
  if (!metadata.ProductVersion && !metadata.FileVersion) {
    addError(report, "missing-version", "主程序缺少 ProductVersion/FileVersion");
  }
  if (options.expectedVersion) {
    const versions = [metadata.ProductVersion, metadata.FileVersion].filter(Boolean);
    const normalizeVersion = (value) => String(value).split(".").map(Number).join(".").replace(/(?:\.0)+$/, "");
    if (!versions.some((version) => normalizeVersion(version) === normalizeVersion(options.expectedVersion))) {
      addError(report, "version-mismatch", `程序版本与预期 ${options.expectedVersion} 不一致`, { actual: versions });
    }
  }
  if ((metadata.CompanyName ?? "").trim().toLowerCase() === "milind soni") {
    addError(report, "upstream-company", "主程序 CompanyName 仍是上游作者名称");
  }
}

/** Inspect only a packaged directory; no application process or user data is touched. */
export function inspectRelease(root, options = {}) {
  const resolvedRoot = path.resolve(root);
  const report = {
    root: resolvedRoot,
    ok: false,
    checkedFiles: [],
    scannedBytes: 0,
    executable: null,
    metadata: null,
    errors: [],
    warnings: [],
  };
  const settings = { expectedProductName: "Mark Bot", ...options };
  let stat;
  try {
    stat = fs.statSync(resolvedRoot);
  } catch {
    addError(report, "invalid-release-directory", `发布目录不存在：${resolvedRoot}`);
    return report;
  }
  if (!stat.isDirectory()) {
    addError(report, "invalid-release-directory", `发布路径不是目录：${resolvedRoot}`);
    return report;
  }

  checkRequiredFile(report, resolvedRoot, "resources/app.asar");
  checkRequiredFile(report, resolvedRoot, "resources/server/index.js");
  checkRequiredFile(report, resolvedRoot, "resources/ui/index.html");
  checkExecutable(report, resolvedRoot, settings);

  const asar = path.join(resolvedRoot, "resources", "app.asar");
  if (fs.existsSync(asar) && fs.statSync(asar).isFile()) scanFile(report, resolvedRoot, asar, { binary: true });
  for (const directory of RUNTIME_DIRECTORIES) {
    const runtimeRoot = path.join(resolvedRoot, "resources", directory);
    if (!fs.existsSync(runtimeRoot)) continue;
    const { files, skipped } = walkFiles(runtimeRoot);
    for (const file of skipped) addWarning(report, "symlink-skipped", `跳过发布包中的符号链接：${relativeFile(resolvedRoot, file)}`);
    for (const file of files) {
      if (isTextCandidate(file)) scanFile(report, resolvedRoot, file);
    }
  }
  const updateMetadata = path.join(resolvedRoot, "resources", "app-update.yml");
  if (fs.existsSync(updateMetadata)) scanFile(report, resolvedRoot, updateMetadata);

  report.ok = report.errors.length === 0;
  return report;
}

export function formatReport(report) {
  const lines = [
    `Mark Bot 发布检查：${report.ok ? "通过" : "未通过"}`,
    `目录：${report.root}`,
    `已扫描：${report.checkedFiles.length} 个文件，${report.scannedBytes} 字节`,
  ];
  for (const error of report.errors) {
    const location = [error.file, error.line, error.column].filter((value) => value !== undefined).join(":");
    const count = error.occurrences > 1 ? `；共 ${error.occurrences} 处` : "";
    lines.push(`[错误] ${error.code}${location ? ` (${location})` : ""}：${error.message}${error.match ? `；匹配 ${error.match}` : ""}${count}`);
  }
  for (const warning of report.warnings) {
    const count = warning.occurrences > 1 ? `；共 ${warning.occurrences} 处` : "";
    lines.push(`[提醒] ${warning.code}${warning.file ? ` (${warning.file})` : ""}：${warning.message}${count}`);
  }
  return lines.join("\n");
}

function usage() {
  return [
    "用法：node scripts/check-markbot-release.mjs <win-unpacked目录> [选项]",
    "选项：--json 输出 JSON；--expected-version X.Y.Z 校验版本；--skip-metadata 跳过 exe 元数据",
  ].join("\n");
}

function main(argv) {
  const args = [...argv];
  const json = args.includes("--json");
  const skipMetadata = args.includes("--skip-metadata");
  const versionIndex = args.indexOf("--expected-version");
  const expectedVersion = versionIndex >= 0 ? args[versionIndex + 1] : undefined;
  const root = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--expected-version");
  if (!root || args.includes("--help") || (versionIndex >= 0 && !expectedVersion)) {
    console.error(usage());
    return 2;
  }
  const report = inspectRelease(root, { expectedVersion, skipMetadata });
  if (json) console.log(JSON.stringify(report, null, 2));
  else console.log(formatReport(report));
  return report.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
