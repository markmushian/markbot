import { parseJson, type JsonValue } from "./schema.ts";
import { isBotPackage, parseBotPackage, parsePackageDocument, upgradeV1, type PackageDocument, type ParsedBotPackage } from "./bot-package.ts";
import { PACKAGE_V1_VERSION } from "../shared/package-format.ts";
import { parseTeamManifest, type ParsedTeamManifest, type TeamManifestV2 } from "./team-manifest.ts";
import { grokMarketplaceSlugFrom, grokMarketplaceUrl, grokShareIdFrom, grokShareUrl, type GrokTemplateCard } from "../shared/grok-import.ts";

/** The community repo belongs to the person who owns this installation. Sign in on
 * github.com with the markmushian account to publish templates;
 * MARKBOT_TEAM_LIBRARY_* still lets another repo be used. */
export const TEAM_LIBRARY_REPOSITORY = process.env.MARKBOT_TEAM_LIBRARY_REPOSITORY?.trim() || "https://github.com/markmushian/markbot";
export const TEAM_LIBRARY_RAW_ROOT = process.env.MARKBOT_TEAM_LIBRARY_RAW_ROOT?.trim() || "https://raw.githubusercontent.com/markmushian/markbot/main/teams";
export const TEAM_LIBRARY_CATALOG_URL = `${TEAM_LIBRARY_RAW_ROOT.replace(/\/$/, "")}/catalog.json`;

const MAX_CATALOG_BYTES = 256_000;
const MAX_MANIFEST_BYTES = 1_000_000;

export interface TeamCatalogEntry {
  slug: string;
  name: string;
  summary: string;
  category: string;
  outcome?: string;
  setupMinutes?: number;
  featured?: boolean;
  package?: string;
  manifest: string;
  readme: string;
  members: number;
  skills: string[];
  requires: { apps: string[] };
}

export interface TeamCatalog {
  format: "openmaus.catalog";
  version: 1;
  repositoryUrl: string;
  teams: TeamCatalogEntry[];
}

type Fetcher = typeof fetch;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${field} is too long`);
  return normalized;
}

function relativeFile(value: unknown, field: string, suffix: string, prefix: string): string {
  const path = text(value, field, 300);
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    !path.startsWith(prefix) ||
    !path.endsWith(suffix)
  ) {
    throw new Error(`${field} is not a safe catalog path`);
  }
  return path;
}

function stringList(value: unknown, field: string, maxItems: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${field} is invalid`);
  return value.map((item, index) => text(item, `${field}[${index}]`, 100));
}

/** Validate the remotely maintained index before any of it reaches the renderer. */
export function parseTeamCatalog(value: unknown): TeamCatalog {
  if (!isRecord(value) || value.format !== "openmaus.catalog" || value.version !== 1) {
    throw new Error("The team library catalog is not supported");
  }
  if (!Array.isArray(value.teams) || value.teams.length > 100) {
    throw new Error("The team library catalog is invalid");
  }
  const slugs = new Set<string>();
  const teams = value.teams.map((raw, index): TeamCatalogEntry => {
    const field = `teams[${index}]`;
    if (!isRecord(raw)) throw new Error(`${field} is invalid`);
    const slug = text(raw.slug, `${field}.slug`, 80);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || slugs.has(slug)) {
      throw new Error(`${field}.slug is invalid`);
    }
    slugs.add(slug);
    const prefix = `teams/${slug}/`;
    const requires = isRecord(raw.requires) ? raw.requires : {};
    return {
      slug,
      name: text(raw.name, `${field}.name`, 100),
      summary: text(raw.summary, `${field}.summary`, 300),
      category: text(raw.category, `${field}.category`, 80),
      ...(typeof raw.outcome === "string" ? { outcome: text(raw.outcome, `${field}.outcome`, 300) } : {}),
      ...(typeof raw.setupMinutes === "number" && Number.isSafeInteger(raw.setupMinutes) && raw.setupMinutes > 0 && raw.setupMinutes <= 240
        ? { setupMinutes: raw.setupMinutes }
        : {}),
      ...(typeof raw.featured === "boolean" ? { featured: raw.featured } : {}),
      ...(raw.package !== undefined
        ? { package: relativeFile(raw.package, `${field}.package`, ".md", "packages/") }
        : {}),
      manifest: relativeFile(raw.manifest, `${field}.manifest`, ".mausteam.json", prefix),
      readme: relativeFile(raw.readme, `${field}.readme`, "README.md", prefix),
      members:
        typeof raw.members === "number" && Number.isSafeInteger(raw.members) && raw.members > 0 && raw.members <= 200
          ? raw.members
          : (() => { throw new Error(`${field}.members is invalid`); })(),
      skills: Array.isArray(raw.skills)
        ? raw.skills.map((skill, skillIndex) =>
            relativeFile(skill, `${field}.skills[${skillIndex}]`, "SKILL.md", `${prefix}skills/`),
          )
        : (() => { throw new Error(`${field}.skills is invalid`); })(),
      requires: { apps: stringList(requires.apps ?? [], `${field}.requires.apps`, 30) },
    };
  });
  return {
    format: "openmaus.catalog",
    version: 1,
    repositoryUrl: TEAM_LIBRARY_REPOSITORY,
    teams,
  };
}

/** Teams that work with no network at all. The overseas/GitHub directory may be
 * slow or unreachable on a mainland connection; these keep Templates usable. */
interface BundledTeam { entry: TeamCatalogEntry; manifest: TeamManifestV2 }

const bundled = (slug: string, name: string, summary: string, category: string,
  members: TeamManifestV2["team"]["members"]): BundledTeam => ({
  entry: {
    slug, name, summary, category, setupMinutes: 3, featured: true,
    manifest: `teams/${slug}/team.mausteam.json`, readme: `teams/${slug}/README.md`,
    members: members.length, skills: [], requires: { apps: [] },
  },
  manifest: {
    format: "openmaus.team", version: 2,
    team: { name, description: summary, members },
  },
});

const BUNDLED_TEAMS: BundledTeam[] = [
  bundled("daily-brief", "每日简报组", "每天汇总邮件、日程与待办，给你一份可执行的晨报", "日常", [
    { key: "mail", name: "邮件整理", title: "收件箱助手", description: "挑出需要回复的邮件并起草回复", soul: "每天早上列出未读邮件，分成需要回复、知会、可忽略三类，需要回复的先起草但绝不自动发送。", appearance: { color: "blue" } },
    { key: "calendar", name: "日程规划", title: "日程助手", description: "核对当天安排与冲突", soul: "列出今天的会议与到期事项，标出冲突和逾期，并给出每项下一步动作。不要替用户改日历。", appearance: { color: "yellow" } },
    { key: "lead", name: "晨报汇总", title: "组长", description: "把三份结果拼成一页简报", soul: "把邮件、日程、待办汇总成一页：三行摘要，然后待办清单，最重要的排最前。不确定的信息要标注。", appearance: { color: "green" } },
  ]),
  bundled("content-studio", "内容创作组", "从选题、成稿到审核，一条龙产出公众号/短视频文案", "写作", [
    { key: "topic", name: "选题策划", title: "选题助手", description: "找角度、列提纲", soul: "根据给定主题提出 3 个角度，各写一句卖点和目标读者，再由用户选一个。不要凭空编造数据。", appearance: { color: "purple" } },
    { key: "writer", name: "撰稿", title: "写作助手", description: "按用户语气成稿", soul: "用平实具体的中文写初稿，短句为主，去掉套话。写完列出三处主要修改建议。", appearance: { color: "pink" } },
    { key: "review", name: "审核", title: "质量审核员", description: "事实、语气、格式校对", soul: "逐条核对稿件里的事实、数字和引用，标出无法核实的内容；再检查语气与错别字，最后给可否发布的结论。", appearance: { color: "coral" } },
  ]),
  bundled("dev-squad", "研发小组", "读代码、改实现、跑测试并解释变更", "工作", [
    { key: "dev", name: "开发", title: "编程搭档", description: "在项目目录里改代码", soul: "先读再改，跟随项目既有风格，保持改动小而聚焦。改完运行测试并如实汇报输出，包括失败。", appearance: { color: "cyan" } },
    { key: "reviewer", name: "代码审查", title: "审查助手", description: "找问题、给建议", soul: "按影响从大到小列出问题：正确性、边界条件、可读性、测试覆盖。每条给出具体改法，不自己动手改代码。", appearance: { color: "teal" } },
    { key: "qa", name: "测试", title: "测试助手", description: "设计用例并跑回归", soul: "根据改动设计最小回归用例，执行并报告真实结果；失败时给出复现步骤和可能原因。", appearance: { color: "orange" } },
  ]),
  bundled("meeting-crew", "会议协作组", "把录音稿变成决定、负责人和会后跟进", "工作", [
    { key: "minutes", name: "会议纪要", title: "纪要助手", description: "整理决定与待办", soul: "输出两行摘要、决定、行动项（负责人/任务/截止）、未解决问题。引语必须来自原文，不确定的标注（不清楚）。", appearance: { color: "blue" } },
    { key: "followup", name: "跟进", title: "跟进助手", description: "起草会后消息", soul: "根据纪要起草会后消息，先给用户确认，绝不自动发送；提醒哪些事项临近截止。", appearance: { color: "green" } },
    { key: "archive", name: "资料归档", title: "资料助手", description: "整理链接与附件", soul: "把会议相关的文件、链接和引用整理成清单，注明来源，缺的标出来。", appearance: { color: "purple" } },
  ]),
];

export function bundledTeamCatalog(): TeamCatalog {
  return {
    format: "openmaus.catalog", version: 1,
    repositoryUrl: TEAM_LIBRARY_REPOSITORY,
    teams: BUNDLED_TEAMS.map((team) => team.entry),
  };
}

const bundledManifest = (slug: string): ParsedTeamManifest | null => {
  const team = BUNDLED_TEAMS.find((candidate) => candidate.entry.slug === slug);
  return team ? parseTeamManifest(team.manifest) : null;
};

async function fetchJson(url: string, maxBytes: number, fetcher: Fetcher, timeoutMs = 10_000): Promise<JsonValue> {
  const response = await fetcher(url, {
    headers: { accept: "application/json, text/plain;q=0.9" },
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const error = Object.assign(new Error(`GitHub returned HTTP ${response.status}`), { status: response.status });
    throw error;
  }
  const announced = Number(response.headers.get("content-length") ?? 0);
  if (announced > maxBytes) throw new Error("The remote team file is too large");
  const raw = await response.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new Error("The remote team file is too large");
  try {
    return parseJson(raw);
  } catch {
    throw new Error("GitHub did not return valid JSON");
  }
}

async function fetchText(url: string, maxBytes: number, fetcher: Fetcher): Promise<string> {
  const response = await fetcher(url, {
    headers: { accept: "text/markdown, text/plain;q=0.9" },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Object.assign(new Error(`GitHub returned HTTP ${response.status}`), { status: response.status });
  const announced = Number(response.headers.get("content-length") ?? 0);
  if (announced > maxBytes) throw new Error("The remote team file is too large");
  const raw = await response.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new Error("The remote team file is too large");
  return raw;
}

export async function fetchTeamCatalog(fetcher: Fetcher = fetch): Promise<TeamCatalog> {
  try {
    // A short budget: a slow overseas host must not hold the Templates dialog hostage.
    return parseTeamCatalog(await fetchJson(TEAM_LIBRARY_CATALOG_URL, MAX_CATALOG_BYTES, fetcher, 4_000));
  } catch (error) {
    // Only the real network path degrades; an injected fetcher still sees the exact failure.
    if (fetcher === fetch) return bundledTeamCatalog();
    throw error;
  }
}

export type ParsedShareableTeam = ParsedTeamManifest | ParsedBotPackage | PackageDocument;

function parseShareable(value: JsonValue | string): ParsedShareableTeam {
  if (typeof value === "string") return parseBotPackage(value);
  if (!isBotPackage(value)) return parseTeamManifest(value);
  // A shared team (v2) is read as a file: it cannot claim a publisher.
  return (value as { version?: unknown }).version === 1 ? parseBotPackage(value) : parsePackageDocument(value, { trust: "file" });
}

async function fetchShareable(url: string, fetcher: Fetcher): Promise<ParsedShareableTeam> {
  return url.endsWith(".md")
    ? parseBotPackage(await fetchText(url, MAX_MANIFEST_BYTES, fetcher))
    : parseShareable(await fetchJson(url, MAX_MANIFEST_BYTES, fetcher));
}

export async function fetchLibraryTeam(slug: string, fetcher: Fetcher = fetch): Promise<ParsedShareableTeam> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error("That team name is invalid");
  const builtIn = bundledManifest(slug);
  if (builtIn) return builtIn;
  const catalog = await fetchTeamCatalog(fetcher);
  const entry = catalog.teams.find((team) => team.slug === slug);
  if (!entry) throw Object.assign(new Error("That library team was not found"), { status: 404 });
  return fetchShareable(`${TEAM_LIBRARY_RAW_ROOT}/${entry.package ?? entry.manifest}`, fetcher);
}

const MAX_CHIEF_TEAMS = 30;
const MAX_ROLE_TEXT = 280;

export interface LibraryRole { name: string; title: string; does?: string; lead?: true }
export interface LibraryTeamRoles { name: string; summary: string; roles: LibraryRole[] }

const oneLine = (text: string, max: number): string => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};

function libraryRoles(team: ParsedShareableTeam): LibraryRole[] {
  const role = (member: { name: string; title?: string; description?: string }, lead: boolean): LibraryRole => ({
    name: member.name, title: member.title?.trim() || "Specialist",
    ...(member.description?.trim() ? { does: oneLine(member.description, MAX_ROLE_TEXT) } : {}),
    ...(lead ? { lead: true as const } : {}),
  });
  if (!("package" in team)) return team.team.members.map((member) => role(member, false));
  const pkg = team.version === PACKAGE_V1_VERSION ? upgradeV1(team).package : team.package;
  return pkg.agents.map((agent) => role(agent, agent.key === pkg.team?.leader));
}

/** Each ready-made team's name, one line and roles: enough for a Chief to create the team itself, one specialist at a
 * time. A team whose file cannot be read keeps its name and summary with no roles. */
export async function libraryTeamRoles(fetcher: Fetcher = fetch): Promise<LibraryTeamRoles[]> {
  const catalog = await fetchTeamCatalog(fetcher);
  return Promise.all(catalog.teams.slice(0, MAX_CHIEF_TEAMS).map(async (entry) => {
    const builtIn = bundledManifest(entry.slug);
    const roles = builtIn
      ? libraryRoles(builtIn)
      : await fetchShareable(`${TEAM_LIBRARY_RAW_ROOT}/${entry.package ?? entry.manifest}`, fetcher).then(libraryRoles, () => []);
    return { name: entry.name, summary: entry.summary, roles };
  }));
}

function safeSegment(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

/** Public GitHub Markdown playbooks and legacy JSON team files only; other hosts never reach server fetch. */
export function githubManifestUrls(input: string): string[] {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid GitHub URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Only public HTTPS GitHub links are supported");
  }
  const parts = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (!parts.every(safeSegment)) throw new Error("That GitHub path is not supported");

  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    if (parts.length === 2) {
      const [owner, repo] = parts;
      return [
        `https://raw.githubusercontent.com/${owner}/${repo}/main/botmrr.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/team.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/main/team.mausteam.json`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/botmrr.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/team.md`,
        `https://raw.githubusercontent.com/${owner}/${repo}/master/team.mausteam.json`,
      ];
    }
    if (parts.length >= 5 && (parts[2] === "blob" || parts[2] === "raw")) {
      const [owner, repo, , ref, ...file] = parts;
      if (!file.at(-1)?.match(/\.(?:md|json)$/)) throw new Error("The GitHub link must point to a Markdown playbook or JSON team file");
      return [`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${file.join("/")}`];
    }
  }

  if (url.hostname === "raw.githubusercontent.com" && parts.length >= 4) {
    if (!parts.at(-1)?.match(/\.(?:md|json)$/)) throw new Error("The GitHub link must point to a Markdown playbook or JSON team file");
    return [`https://raw.githubusercontent.com/${parts.join("/")}`];
  }

  throw new Error("Paste a GitHub repository, Markdown playbook, or legacy JSON team link");
}

export async function fetchGithubTeam(input: string, fetcher: Fetcher = fetch): Promise<ParsedShareableTeam> {
  const urls = githubManifestUrls(input);
  let lastError: unknown;
  for (const url of urls) {
    try {
      return await fetchShareable(url, fetcher);
    } catch (error) {
      lastError = error;
      if ((error as { status?: number }).status !== 404) throw error;
    }
  }
  throw lastError ?? new Error("No botmrr.md, team.md, or legacy team file was found in that repository");
}

const GROK_HOSTS = new Set(["x.ai", "www.x.ai"]);
const MAX_GROK_PAGE_BYTES = 2 * 1024 * 1024;
const GROK_TIMEOUT_MS = 20_000;
const MAX_GROK_REDIRECTS = 3;

const statusError = (message: string, status: number) => Object.assign(new Error(message), { status });

function onGrokHost(url: URL): boolean {
  return url.protocol === "https:" && GROK_HOSTS.has(url.hostname) && !url.username && !url.password && !url.port;
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) throw statusError("That x.ai page is too large", 502);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw statusError("That x.ai page is too large", 502);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The Next.js flight data the page streams in `self.__next_f.push([1,"…"])` scripts, decoded and joined. */
function flightText(html: string): string {
  const marker = "self.__next_f.push([1,";
  const parts: string[] = [];
  for (let at = html.indexOf(marker); at >= 0; at = html.indexOf(marker, at + marker.length)) {
    const start = at + marker.length;
    if (html[start] !== '"') continue;
    let end = start + 1;
    while (end < html.length && html[end] !== '"') end += html[end] === "\\" ? 2 : 1;
    try {
      const chunk: unknown = JSON.parse(html.slice(start, end + 1));
      if (typeof chunk === "string") parts.push(chunk);
    } catch {
      // not a plain string chunk
    }
  }
  return parts.join("");
}

/** The JSON object that starts at `start`, or null. */
function objectAt(text: string, start: number): Record<string, unknown> | null {
  let depth = 0;
  let quoted = false;
  for (let i = start; i < text.length && i - start < 64_000; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === "\\") i += 1;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth += 1;
    else if (c === "}" && --depth === 0) {
      try {
        const value: unknown = JSON.parse(text.slice(start, i + 1));
        return isRecord(value) ? value : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** The page's own record for this bot: {id, ownerType, sharerName, botName, description, color, shape}. */
function embeddedTemplate(html: string, shareId: string): Record<string, unknown> | null {
  const text = flightText(html);
  const needle = `"id":${JSON.stringify(shareId)}`;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) {
    const value = objectAt(text, text.lastIndexOf("{", at));
    if (value && value.id === shareId && typeof value.botName === "string") return value;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? match;
    const code = name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

function metaContent(html: string, property: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!new RegExp(`\\b(?:property|name)=["']${property}["']`, "i").test(tag)) continue;
    const content = tag.match(/\bcontent=(?:"([^"]*)"|'([^']*)')/i);
    if (content) return decodeEntities(content[1] ?? content[2] ?? "").trim();
  }
  return "";
}

const cardText = (value: unknown, max: number) =>
  // eslint-disable-next-line no-control-regex
  typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";

/** Name, creator and description from a share page: the embedded record first, then the og tags. */
export function grokCardFromHtml(html: string, shareId: string): GrokTemplateCard {
  const embedded = embeddedTemplate(html, shareId);
  let name = cardText(embedded?.botName, 100).replace(/\s+/g, " ");
  let creator = cardText(embedded?.sharerName, 100).replace(/\s+/g, " ");
  let description = cardText(embedded?.description, 2_000);
  if (!name) {
    const title = metaContent(html, "og:title");
    const by = title.lastIndexOf(" by ");
    name = cardText(by > 0 ? title.slice(0, by) : title, 100);
    creator = by > 0 ? cardText(title.slice(by + 4), 100) : "";
  }
  if (!description) description = cardText(metaContent(html, "og:description"), 2_000);
  if (!name) throw statusError("That x.ai page did not show a Grok Bot. The link may be private, team-only or removed.", 404);
  const color = typeof embedded?.color === "string" && /^#[0-9a-f]{3,8}$/i.test(embedded.color) ? embedded.color : undefined;
  return { shareId, name, ...(creator ? { creator } : {}), description, url: grokShareUrl(shareId), ...(color ? { color } : {}) };
}

/** An x.ai page's HTML: only https://x.ai (or www) and redirects that stay there, within the time and size caps. */
async function fetchGrokPage(target: URL, fetcher: Fetcher, signal: AbortSignal, notFound: string): Promise<string> {
  for (let hop = 0; ; hop += 1) {
    if (!onGrokHost(target)) throw statusError("That Grok Bot link tried to leave x.ai", 502);
    const response = await fetcher(target.toString(), { headers: { accept: "text/html" }, redirect: "manual", signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop >= MAX_GROK_REDIRECTS) throw statusError("x.ai did not show the Grok Bot page", 502);
      target = new URL(location, target);
      continue;
    }
    if (response.status === 404) throw statusError(notFound, 404);
    if (!response.ok) throw statusError(`x.ai returned HTTP ${response.status}`, 502);
    return readCapped(response, MAX_GROK_PAGE_BYTES);
  }
}

/** The share id a marketplace page's Add button points at: its own entry's addHref, or the page's only one. */
export function grokShareIdFromMarketplace(html: string, slug: string): string | null {
  const text = html.replace(/\\"/g, '"');
  const entry = text.indexOf(`"id":"${slug}"`);
  const next = entry >= 0 ? text.indexOf('"id":"', entry + 6) : -1;
  const own = entry >= 0 ? text.slice(entry, next > entry ? next : entry + 4_000).match(/"addHref":"\/bot\/([A-Za-z0-9_-]{21})"/) : null;
  if (own) return own[1]!;
  const all = [...new Set([...text.matchAll(/"addHref":"\/bot\/([A-Za-z0-9_-]{21})"/g)].map((match) => match[1]!))];
  return all.length === 1 ? all[0]! : null;
}

/** The public card for a Grok Bot share link or marketplace page. Fetches only x.ai pages and redirects that stay on x.ai. */
export async function fetchGrokTemplateCard(input: string, fetcher: Fetcher = fetch): Promise<GrokTemplateCard> {
  const signal = AbortSignal.timeout(GROK_TIMEOUT_MS);
  try {
    let shareId = grokShareIdFrom(input);
    const slug = shareId ? null : grokMarketplaceSlugFrom(input);
    if (!shareId && !slug) throw statusError("Paste a Grok Bot link, like https://x.ai/bot/… or a Grok Bot marketplace page", 400);
    if (slug) {
      const market = await fetchGrokPage(new URL(grokMarketplaceUrl(slug)), fetcher, signal, "That Grok Bot marketplace page was not found.");
      shareId = grokShareIdFromMarketplace(market, slug);
      if (!shareId) throw statusError("That marketplace page did not link to a Grok Bot to add.", 404);
    }
    const html = await fetchGrokPage(new URL(grokShareUrl(shareId!)), fetcher, signal, "That Grok Bot link was not found. It may be private, team-only or removed.");
    return grokCardFromHtml(html, shareId!);
  } catch (error) {
    if ((error as { name?: string }).name === "TimeoutError") throw statusError("x.ai did not answer within 20 seconds. Try again.", 502);
    throw error;
  }
}
