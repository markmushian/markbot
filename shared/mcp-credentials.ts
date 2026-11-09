/** Credentials a person fills in from MCP settings, without hand-editing config.json.
 *
 * A shipped preset keeps `REPLACE_XXX` markers where its key belongs. The first save records where each marker
 * sat (`credentialTargets`), so later saves can overwrite a value even after the marker is gone. Values themselves
 * are never sent to the renderer: the listing only says which fields exist and whether each one has been filled. */

const MARKER = /REPLACE_([A-Z0-9_]+)/g;

/** An argv entry holding a credential is write-only in listings: the real value never reaches the renderer. */
export const MASKED_ARG = "(已保存的凭证)";

export interface McpCredentialTarget {
  source: "env" | "header" | "arg";
  /** An env/header name, or the decimal index of an argv entry. */
  key: string;
  /** The original string, markers included. Used to put a new value back in the same place. */
  template: string;
  tokens: string[];
}

export interface McpCredentialLink {
  label: string;
  url: string;
}

export interface McpCredentialField {
  token: string;
  label: string;
  hint: string;
  secret: boolean;
  /** Main page to open when getting this value, so nobody has to guess where the console is. */
  url?: string;
  /** Short caption for the main link; the default is 打开申请页面. */
  urlLabel?: string;
  /** Extra official pages (alternate console, docs) shown beside the main link. */
  links?: McpCredentialLink[];
  /** True once a real value sits there instead of a `REPLACE_…` marker. */
  filled: boolean;
}

interface Hint {
  label: string;
  hint: string;
  url?: string;
  urlLabel?: string;
  links?: McpCredentialLink[];
  secret?: boolean;
}

/** Chinese labels and the exact place to get each value, for the presets this build ships.
 *  Hints name the click path and any prerequisite (admin / paid plan), because "在开放平台获取"
 *  is not actionable: several of these consoles need an org admin or a paid membership. */
const HINTS: Record<string, Hint> = {
  QQ_EMAIL: {
    label: "QQ 邮箱地址",
    hint: "用于收发信的完整邮箱地址，例如 12345@qq.com。",
    url: "https://mail.qq.com/",
  },
  QQ_AUTH_CODE: {
    label: "QQ 邮箱授权码",
    hint: "登录网页版 QQ 邮箱 → 设置 → 账号 → 开启「IMAP/SMTP 服务」→ 按提示发短信 → 生成 16 位授权码。填的是授权码，不是 QQ 密码。",
    url: "https://mail.qq.com/",
    secret: true,
  },
  TENCENT_DOCS_TOKEN: {
    label: "腾讯文档 MCP 个人 Token",
    hint: "⚠️ 别填「开放生态 → 开发者信息」里 eyJ 开头的 access_token：那是开放平台 OAuth 令牌，官方 MCP 端点会直接判为无效（已实测）。正确入口是下方「官方 MCP Token 页」——页面显示「腾讯文档 Skill / 龙虾专用入口」是官方新版样式，不是跳错页；用 QQ/微信登录后生成并复制个人 Token，整串粘贴，不要加 Bearer、不要带空格，免费约 2000 次/天。超级会员也可以改用空间右上角「≡ → 使用MCP → 获取MCP token」的空间令牌（有效期 1 年）。",
    url: "https://docs.qq.com/open/auth/mcp.html",
    urlLabel: "官方 MCP Token 页（个人 Token）",
    links: [
      { label: "空间 MCP token 获取说明（需超级会员）", url: "https://docs.qq.com/open/document/mcp/get-token/" },
      { label: "官方 MCP 接入文档", url: "https://docs.qq.com/aio/p/scscyt11f44r7mn?nlc=1" },
      { label: "开放生态首页（开发者信息，另一套令牌）", url: "https://docs.qq.com/open/developers/#/home" },
    ],
    secret: true,
  },
  GITEE_TOKEN: {
    label: "Gitee 私人令牌",
    hint: "登录 Gitee → 头像 → 设置 → 私人令牌 → 生成新令牌，至少勾选 projects、issues、pull_requests、notifications。生成后只显示一次，立刻复制。",
    url: "https://gitee.com/profile/personal_access_tokens",
    secret: true,
  },
  BAIDU_PAN_TOKEN: {
    label: "百度网盘 Access Token",
    hint: "这是百度网盘官方 MCP 的授权流程：打开下方官方授权页 → 扫码登录并同意 → 页面只显示「百度 OAuth2.0」是正常现象，令牌就在浏览器地址栏 # 后面。把整段地址复制粘贴进下面输入框即可，系统会自动取出 access_token，不用自己找那一串。令牌约 30 天有效，过期重新授权；不需要创建应用，也不需要开发者认证。",
    url: "https://openapi.baidu.com/oauth/2.0/authorize?response_type=token&client_id=QHOuRXiepJBMjtk0esLhrPoNlQyYd0mF&redirect_uri=oob&scope=basic%2Cnetdisk&qrcode=1",
    urlLabel: "打开百度官方授权页（扫码登录）",
    links: [
      { label: "百度网盘官方 MCP 接入文档", url: "https://pan.baidu.com/union/doc/mcp-server/mcp-sdk/python-sdk-stdio%E6%A8%A1%E5%BC%8F/" },
      { label: "授权管理（可解绑）", url: "https://passport.baidu.com/center" },
    ],
    secret: true,
  },
  FEISHU_APP_ID: {
    label: "飞书应用 App ID",
    hint: "开发者后台 → 创建企业自建应用 → 「凭证与基础信息」里的 App ID（cli_ 开头）。需要企业管理员权限；建好应用后还要在「权限管理」开通 API 权限并发布版本才能调用。",
    url: "https://open.feishu.cn/app",
  },
  FEISHU_APP_SECRET: {
    label: "飞书应用 App Secret",
    hint: "同一个自建应用「凭证与基础信息」页里的 App Secret。注意别复制到「 encrypt key / 事件订阅」的其他字段。",
    url: "https://open.feishu.cn/app",
    secret: true,
  },
  DINGTALK_APP_KEY: {
    label: "钉钉应用 AppKey",
    hint: "开放平台 → 应用开发 → 企业内部开发 → 创建应用 → 「凭证与基础信息」里的 AppKey（也叫 Client ID）。需要钉钉组织管理员；至少开通 qyapi_get_member 权限，权限生效约需几分钟。",
    url: "https://open.dingtalk.com/",
  },
  DINGTALK_APP_SECRET: {
    label: "钉钉应用 AppSecret",
    hint: "同上页面的 AppSecret / Client Secret。个人账号没有企业内部应用入口时，需要让组织管理员代建。",
    url: "https://open.dingtalk.com/",
    secret: true,
  },
  WECOM_KEY: {
    label: "企业微信群机器人 Key",
    hint: "不需要开放平台、不需要企业后台。在企业微信「群聊 → 右上角设置 → 群机器人 → 添加机器人」后复制 Webhook 地址，只填 key= 后面那串字符即可。此接入只能往群里发消息，读不到消息。",
    secret: true,
  },
  YUQUE_TOKEN: {
    label: "语雀 Token",
    hint: "语雀 → 头像 → 个人设置 → 「Token / 开发者设置」→ 生成个人访问令牌。⚠️ 个人 Token 属于语雀超级会员权益，免费账号看不到这个入口；团队 Token 需旗舰版空间。",
    url: "https://www.yuque.com/settings",
    secret: true,
  },
  TAPD_TOKEN: {
    label: "TAPD API Token",
    hint: "登录 TAPD → 打开「API Token 管理」→ 创建个人令牌，令牌只显示一次。（也可在「我的设置 → 个人访问令牌」生成。）",
    url: "https://www.tapd.cn/company/my_tokens",
    secret: true,
  },
  TAPD_WORKSPACE_ID: {
    label: "TAPD 项目 ID",
    hint: "打开任一 TAPD 项目，网址里 /tapd_fe/ 后面那串数字就是项目 ID。可留空，每次调用工具时再指定。",
  },
  OBSIDIAN_API_KEY: {
    label: "Obsidian Local REST API 密钥",
    hint: "先在 Obsidian 安装并启用社区插件「Local REST API」（coddingtonbear），到「设置 → Local REST API」复制自动生成的 API key，并打开「Enable HTTP server」（默认 http://127.0.0.1:27123）。Obsidian 必须保持运行才能连上；这是本机令牌，不是 Obsidian 账号密码。",
    url: "https://github.com/coddingtonbear/obsidian-local-rest-api",
    urlLabel: "打开官方插件说明",
    secret: true,
  },
  QQ_APP_ID: {
    label: "QQ 机器人 AppID",
    hint: "登录 QQ 开放平台 → 创建机器人 → 「开发设置」里复制 BotAppID（102 开头的数字）。这里用的是 QQ 官方机器人 OpenAPI（社区版 qqbot-mcp 封装），不是托管你的个人 QQ 账号：先把自己的 QQ 加进「开发体验号码」，沙箱环境可直接收发消息；正式上线还需要提审和 IP 白名单。",
    url: "https://q.qq.com/",
    urlLabel: "打开 QQ 开放平台",
    links: [
      { label: "QQ 机器人官方接入文档", url: "https://bot.q.qq.com/wiki/develop/api-v2/" },
      { label: "qqbot-mcp 凭证获取说明", url: "https://github.com/Pheobe-Southwood/qqbot-mcp/blob/main/docs/CREDENTIALS.md" },
    ],
  },
  QQ_APP_SECRET: {
    label: "QQ 机器人 AppSecret",
    hint: "同一机器人「开发设置」页里的 AppSecret（也叫 Client Secret）。它与 AppID 配对用于换取 access_token，只显示一次，复制后立刻粘贴。",
    url: "https://q.qq.com/",
    secret: true,
  },
  TENCENT_MEETING_TOKEN: {
    label: "腾讯会议 MCP 个人 Token",
    hint: "打开腾讯会议官方「AI Skill 专区」，用个人版/专业版账号登录（企业账号暂不支持内测，需先切回个人账号），复制页面给出的个人 Token。整串粘贴，不要加 Bearer、不要带空格。本工具走官方云端端点 mcp.meeting.tencent.com，Token 会放进 X-Tencent-Meeting-Token 请求头。⚠️ 这个 Token 等于你的会议身份凭证：拿到它的人能以你的名义预约、修改、取消会议并读取录制和纪要，不要发给任何人。",
    url: "https://meeting.tencent.com/ai-skill",
    urlLabel: "打开官方 AI Skill 专区获取 Token",
    links: [
      { label: "腾讯会议 MCP 官方说明", url: "https://meeting.tencent.com/support/topic/2233/index.html" },
      { label: "官方能力清单与常见问题", url: "https://meeting.tencent.com/support/articles/14/index.html" },
    ],
    secret: true,
  },
  GMAIL_EMAIL: {
    label: "Gmail 邮箱地址",
    hint: "完整的 Gmail 地址，例如 yourname@gmail.com。用 IMAP/SMTP 接入，不需要 OAuth 客户端。",
  },
  GMAIL_APP_PASSWORD: {
    label: "Gmail 应用专用密码",
    hint: "⚠️ 不是 Gmail 登录密码。先给 Google 账号开启两步验证，再到「安全性 → 应用专用密码」生成一个 16 位密码，去掉空格整串粘贴。国内网络访问 imap.gmail.com / smtp.gmail.com 可能不稳定，连不上时先检查网络。",
    url: "https://myaccount.google.com/apppasswords",
    urlLabel: "打开 Google 应用专用密码页",
    secret: true,
  },
  GITHUB_TOKEN: {
    label: "GitHub Personal Access Token",
    hint: "个人账号和私有仓库都能用，不需要 Copilot 订阅。到 GitHub → 头像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens 新建：Repository access 选 Only select repositories 并勾上你的私有仓库，权限至少给 Contents: Read（要改代码再加 Issues 和 Pull requests 的读写）。令牌能访问哪些仓库，机器人就只能看到哪些。这里连的是 GitHub 官方托管 MCP（api.githubcopilot.com），不走本地 npm 包，所以不会卡在首次下载。国内直连可能超时，连不上时先检查代理。",
    url: "https://github.com/settings/personal-access-tokens",
    urlLabel: "打开 GitHub 令牌设置",
    links: [
      { label: "GitHub 官方 MCP Server 说明", url: "https://github.com/github/github-mcp-server" },
    ],
    secret: true,
  },
  JIMENG_ACCESS_KEY: {
    label: "火山引擎 Access Key",
    hint: "登录火山引擎控制台 → 开通「即梦 AI」图像/视频生成服务（有免费试用）→ 右上角头像 → 访问控制 → 访问密钥 → 新建密钥，复制 Access Key（通常 AKLT 开头）。这是官方 API 密钥，不是即梦网页的账号密码，也不是浏览器里的 sessionid。",
    url: "https://console.volcengine.com/iam/keymanage/",
    urlLabel: "打开火山引擎访问密钥",
    links: [
      { label: "即梦 AI 控制台（先开通服务）", url: "https://console.volcengine.com/ai/ability/detail/2" },
    ],
  },
  JIMENG_SECRET_KEY: {
    label: "火山引擎 Secret Key",
    hint: "新建密钥时只显示一次的 Secret Key，与上面的 Access Key 配对；丢了就删掉重建。不要把即梦网页版的 sessionid 填在这里——那种逆向接法不稳定，也可能违反服务条款。",
    url: "https://console.volcengine.com/iam/keymanage/",
    secret: true,
  },

};

export function credentialHint(token: string): {
  label: string; hint: string; secret: boolean;
  url?: string; urlLabel?: string; links?: McpCredentialLink[];
} {
  const known = HINTS[token];
  return known
    ? {
      label: known.label, hint: known.hint, secret: known.secret === true,
      ...(known.url ? { url: known.url } : {}),
      ...(known.urlLabel ? { urlLabel: known.urlLabel } : {}),
      ...(known.links ? { links: known.links } : {}),
    }
    : { label: token.replace(/_/g, " "), hint: "请到该服务商的开放平台获取这个值。", secret: true };
}

function markers(template: string): Array<{ token: string; at: number; length: number }> {
  return [...template.matchAll(MARKER)].map((match) => ({
    token: match[1]!.toUpperCase(), at: match.index ?? 0, length: match[0].length,
  }));
}

function stringsOf(raw: unknown): Array<{ source: McpCredentialTarget["source"]; key: string; value: string }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const record = raw as Record<string, unknown>;
  const out: Array<{ source: McpCredentialTarget["source"]; key: string; value: string }> = [];
  for (const source of ["env", "header"] as const) {
    const map = source === "env" ? record.env : record.headers;
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
      if (typeof value === "string") out.push({ source, key, value });
    }
  }
  if (Array.isArray(record.args)) {
    record.args.forEach((value, index) => {
      if (typeof value === "string") out.push({ source: "arg", key: String(index), value });
    });
  }
  return out;
}

/** Finds every marker in a raw config.json entry. Nothing here reads or returns a real secret. */
export function findCredentialTargets(raw: unknown): McpCredentialTarget[] {
  return stringsOf(raw).flatMap(({ source, key, value }) => {
    const tokens = markers(value).map((marker) => marker.token);
    if (!tokens.length) return [];
    return [{ source, key, template: value, tokens: [...new Set(tokens)] }];
  });
}

function readString(raw: unknown, target: McpCredentialTarget): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  if (target.source === "arg") {
    const args = record.args;
    return Array.isArray(args) ? (typeof args[Number(target.key)] === "string" ? args[Number(target.key)] as string : undefined) : undefined;
  }
  const map = target.source === "env" ? record.env : record.headers;
  if (!map || typeof map !== "object" || Array.isArray(map)) return undefined;
  const value = (map as Record<string, unknown>)[target.key];
  return typeof value === "string" ? value : undefined;
}

function withString(raw: unknown, target: McpCredentialTarget, value: string): Record<string, unknown> {
  const record = { ...(raw as Record<string, unknown>) };
  if (target.source === "arg") {
    const args = Array.isArray(record.args) ? [...record.args] : [];
    args[Number(target.key)] = value;
    record.args = args;
    return record;
  }
  const field = target.source === "env" ? "env" : "headers";
  const map = record[field];
  record[field] = { ...(map && typeof map === "object" && !Array.isArray(map) ? map as Record<string, unknown> : {}), [target.key]: value };
  return record;
}

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches a saved value against its template so untouched credentials keep what they had. */
function segmentPattern(template: string): RegExp {
  let pattern = "";
  let cursor = 0;
  for (const marker of markers(template)) {
    pattern += `${escapePattern(template.slice(cursor, marker.at))}([\\s\\S]*?)`;
    cursor = marker.at + marker.length;
  }
  return new RegExp(`^${pattern}${escapePattern(template.slice(cursor))}$`);
}

/** Puts the typed values where their markers were, keeping every other value exactly as it is. */
export function applyCredentialValues(
  raw: unknown,
  targets: readonly McpCredentialTarget[],
  values: Readonly<Record<string, string>>,
): Record<string, unknown> {
  let next = { ...(raw as Record<string, unknown>) };
  for (const target of targets) {
    if (!target.tokens.some((token) => values[token] !== undefined)) continue;
    const current = readString(next, target) ?? target.template;
    const segments = current.match(segmentPattern(target.template))?.slice(1);
    let result = "";
    let cursor = 0;
    for (const marker of markers(target.template)) {
      result += target.template.slice(cursor, marker.at);
      const index = target.tokens.indexOf(marker.token);
      const kept = segments && index >= 0 ? segments[index] : undefined;
      result += values[marker.token] ?? kept ?? `REPLACE_${marker.token}`;
      cursor = marker.at + marker.length;
    }
    result += target.template.slice(cursor);
    next = withString(next, target, result);
  }
  return next;
}

/** What the settings screen shows: never a value, only names and whether one is saved. */
export function credentialFields(raw: unknown, targets: readonly McpCredentialTarget[]): McpCredentialField[] {
  const seen = new Set<string>();
  const fields: McpCredentialField[] = [];
  for (const target of targets) {
    const current = readString(raw, target) ?? target.template;
    for (const token of target.tokens) {
      if (seen.has(token)) continue;
      seen.add(token);
      const placeholder = new RegExp(`REPLACE_${escapePattern(token)}`, "i");
      fields.push({ token, ...credentialHint(token), filled: !placeholder.test(current) });
    }
  }
  return fields;
}

/** Hides argv-held credentials in a listing. `masked` tells the settings screen not to offer the raw argv editor. */
export function maskCredentialArgs(args: readonly string[], targets: readonly McpCredentialTarget[]): { args: string[]; masked: boolean } {
  const sensitive = new Set(targets.filter((target) => target.source === "arg").map((target) => Number(target.key)));
  if (!sensitive.size) return { args: [...args], masked: false };
  let masked = false;
  const shown = args.map((arg, index) => {
    // An unfilled marker is not a secret and should still be visible as "needs filling".
    if (!sensitive.has(index) || /REPLACE_[A-Z0-9_]+/i.test(arg)) return arg;
    masked = true;
    return MASKED_ARG;
  });
  return { args: shown, masked };
}

/** Validation shared by the route: a value must be real, single-line and clearly not another marker. */
export function credentialValueError(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return "凭证内容不能为空。";
  if (value.length > 4_096) return "凭证内容过长（最多 4096 个字符）。";
  if (/[\r\n]/.test(value)) return "凭证内容只能是单行。";
  if (/REPLACE_/i.test(value)) return "请填入真实的值，不要保留 REPLACE_ 占位符。";
  return null;
}

/** Official OAuth flows sometimes hand the secret back inside a URL fragment. Accept the whole
 * address bar so nobody has to pick the token out by eye, and strip a stray "Bearer " copied from docs. */
export function normalizeCredentialValue(serverName: string, token: string, value: string): string {
  const text = value.trim();
  if (serverName === "baidu-pan" && token === "BAIDU_PAN_TOKEN") {
    const fromUrl = /(?:^|[?#&])access_token=([^&\s]+)/.exec(text);
    if (fromUrl) return decodeURIComponent(fromUrl[1]!);
    return text.replace(/^Bearer\s+/i, "").trim();
  }
  if ((serverName === "tencent-docs" && token === "TENCENT_DOCS_TOKEN")
    || (serverName === "tencent-meeting" && token === "TENCENT_MEETING_TOKEN")) {
    return text.replace(/^Bearer\s+/i, "").trim();
  }
  return text;
}

/** A wrong-but-plausible value should be explained before it turns into a confusing 401. */
export function credentialAdvice(token: string, value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (token === "TENCENT_DOCS_TOKEN" && /^eyJ[A-Za-z0-9_-]+\./.test(text.replace(/^Bearer\s+/i, ""))) {
    return "这串 eyJ 开头的是「开放生态 → 开发者信息」的 OAuth access_token，不是官方 MCP 个人 Token，端点会拒绝。请到上方「官方 MCP Token 页」重新生成。";
  }
  if (token === "BAIDU_PAN_TOKEN" && /(?:^|[?#&])access_token=/.test(text)) {
    return "检测到整段授权地址，保存时会自动取出其中的 access_token。";
  }
  return null;
}

export type VerifyFailureKind = "rejected" | "timeout" | "unreachable" | "address" | "protocol" | "unknown";

export const VERIFY_FAILURE_LABEL: Record<VerifyFailureKind, string> = {
  rejected: "令牌被拒绝",
  timeout: "连接超时",
  unreachable: "连不上服务",
  address: "地址不对",
  protocol: "不是有效 MCP 服务",
  unknown: "验证失败",
};

/** The probe answers in English, and some servers (Tencent Docs in particular) answer a *rejected token* with a
 * misleading "needs you to sign in" hint. Turn every class of failure into a Chinese, actionable answer. */
export function explainVerifyFailure(raw: string, serverName = ""): { kind: VerifyFailureKind; message: string } {
  const text = raw.trim();
  if (/needs you to sign in|didn't accept the keys|invalid_token|HTTP 401|HTTP 403/i.test(text)) {
    return {
      kind: "rejected",
      message: serverName === "tencent-docs"
        ? "腾讯文档返回「令牌无效」。最常见原因是填成了「开放生态 → 开发者信息」里 eyJ 开头的 access_token（开放平台 OAuth 令牌），官方 MCP 端点不认它。请改用「官方 MCP Token 页」生成的个人 Token，或（超级会员）空间里「≡ → 使用MCP → 获取MCP token」的空间令牌；整串粘贴，不要加 Bearer、不要带空格。令牌过期也会报同样的错，可回原页重置。"
        : "服务端拒绝了凭证（401/403）。请确认密钥复制完整、没有多余空格或前缀、没有过期，且请求头名称正确。",
    };
  }
  if (/did not answer in time|timeout/i.test(text)) {
    return { kind: "timeout", message: "服务端在限定时间内没有应答。可能是网络慢或服务繁忙，稍后点「重新验证」再试一次。" };
  }
  if (/Could not reach this address|HTTP 5\d\d/i.test(text)) {
    return { kind: "unreachable", message: "连不上这个地址。检查网络、代理，以及对方服务是否暂时不可用。" };
  }
  if (/HTTP 404|Check the address and headers/i.test(text)) {
    return { kind: "address", message: "地址不对或服务已下线，无法验证。核对 MCP 服务地址是否仍是官方最新地址。" };
  }
  if (/valid MCP tools list|Could not start this command/i.test(text)) {
    return { kind: "protocol", message: "对方没有返回有效的 MCP 工具列表：可能本地命令没装好、npm 包不存在，或这个地址根本不是 MCP 服务。" };
  }
  return { kind: "unknown", message: text || "服务没有返回任何结果。" };
}
