import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { formatReport, inspectRelease, scanText } from "./check-markbot-release.mjs";

const script = fileURLToPath(new URL("./check-markbot-release.mjs", import.meta.url));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "markbot-release-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "resources", "server"), { recursive: true });
  fs.mkdirSync(path.join(root, "resources", "ui"), { recursive: true });
  fs.writeFileSync(path.join(root, "resources", "app.asar"), "Mark Bot fixture\n");
  fs.writeFileSync(path.join(root, "resources", "server", "index.js"), "export const fixture = true;\n");
  fs.writeFileSync(path.join(root, "resources", "ui", "index.html"), "<title>Mark Bot</title>\n");
  fs.writeFileSync(path.join(root, "Mark Bot.exe"), "fixture");
  return root;
}

function cleanMetadata() {
  return {
    ProductName: "Mark Bot",
    ProductVersion: "1.2.3",
    FileVersion: "1.2.3.0",
    CompanyName: "Mark Bot",
  };
}

function inspectClean(root, extra = {}) {
  return inspectRelease(root, { metadataReader: cleanMetadata, ...extra });
}

test("a clean isolated package passes without reading user data", (t) => {
  const root = fixture(t);
  const report = inspectClean(root);
  assert.equal(report.ok, true, formatReport(report));
  assert.deepEqual(report.errors, []);
  assert.ok(report.checkedFiles.includes("resources/app.asar"));
  assert.ok(report.checkedFiles.includes("resources/server/index.js"));
});

test("runtime upstream endpoints and analytics tokens fail closed and are redacted", (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    path.join(root, "resources", "server", "index.js"),
    "const endpoint = 'https://cloud.openmausbot.com';\nconst repository = 'https://github.com/milind-soni/OpenMausBot';\n",
  );
  fs.writeFileSync(
    path.join(root, "resources", "ui", "index.html"),
    "<script>const token = 'phc_fixtureSecret'; const host = 'https://us.i.posthog.com';</script>\n",
  );
  const report = inspectClean(root);
  assert.equal(report.ok, false);
  const codes = new Set(report.errors.map((error) => error.code));
  assert.ok(codes.has("upstream-domain"));
  assert.ok(codes.has("upstream-repository"));
  assert.ok(codes.has("upstream-posthog"));
  assert.ok(codes.has("analytics-token"));
  assert.equal(JSON.stringify(report).includes("phc_fixtureSecret"), false);
  assert.match(formatReport(report), /已脱敏/);
});

test("attribution in license files does not count as a runtime connection", (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "resources", "licenses"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "resources", "licenses", "MarkBot-NOTICE.txt"),
    "OpenMausBot attribution: https://github.com/milind-soni/OpenMausBot\n",
  );
  const report = inspectClean(root);
  assert.equal(report.ok, true, formatReport(report));
});

test("known example hosts remain visible as warnings without blocking a clean fixture", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "resources", "server", "index.js"), "const example = 'https://c-example.markbot.app';\n");
  const report = inspectClean(root);
  assert.equal(report.ok, true, formatReport(report));
  assert.ok(report.warnings.some((warning) => warning.code === "upstream-domain"));
});

test("app.asar is inspected even though it is a binary container", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "resources", "app.asar"), "https://docs.markbot.app\n");
  const report = inspectClean(root);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "upstream-domain" && error.file === "resources/app.asar"));
});

test("packaged node test sources are rejected", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "resources", "app.asar"), "electron/environments.node-test.mjs\n");
  const report = inspectClean(root);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "packaged-test-source"));
});

test("repeated markers in one file are grouped with an occurrence count", (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, "resources", "server", "index.js"), "https://markbot.app\n".repeat(3));
  const report = inspectClean(root);
  const finding = report.errors.find((error) => error.code === "upstream-domain");
  assert.equal(finding.occurrences, 3);
  assert.equal(finding.locations.length, 3);
});

test("identity and version mismatches are reported independently", (t) => {
  const root = fixture(t);
  fs.renameSync(path.join(root, "Mark Bot.exe"), path.join(root, "Mark Bot OSS.exe"));
  const report = inspectRelease(root, {
    expectedVersion: "2.0.0",
    metadataReader: () => ({
      // An upstream build's identity: every one of these is what this check exists to catch.
      ProductName: "OpenMausBot",
      ProductVersion: "1.2.3",
      FileVersion: "1.2.3",
      CompanyName: "Milind Soni",
    }),
  });
  const codes = new Set(report.errors.map((error) => error.code));
  assert.ok(codes.has("executable-name"));
  assert.ok(codes.has("product-name"));
  assert.ok(codes.has("version-mismatch"));
  assert.ok(codes.has("upstream-company"));
});

test("missing package paths return a report instead of throwing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "markbot-release-missing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = inspectClean(root);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((error) => error.code === "missing-runtime-file"));
  assert.ok(report.errors.some((error) => error.code === "missing-executable"));
});

test("scanText reports source locations and caps repeated findings", () => {
  const findings = scanText(`ok\n${"https://markbot.app ".repeat(60)}`);
  assert.ok(findings.length > 0);
  assert.ok(findings.length <= 100);
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].column, 1);
});

test("the CLI can run against an isolated fixture with no metadata dependency", (t) => {
  const root = fixture(t);
  const output = execFileSync(process.execPath, [script, root, "--skip-metadata", "--json"], { encoding: "utf8" });
  const report = JSON.parse(output);
  assert.equal(report.ok, true);
  assert.equal(report.executable, process.platform === "win32" ? "Mark Bot.exe" : null);
});
