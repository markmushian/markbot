import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, RefreshCw, Search, Server, TriangleAlert, X } from "lucide-react";
import { api, useStore, type Bot, type InstanceInfo } from "@/state/store";
import { cn } from "@/lib/cn";
import { glassPopupFrameStyle } from "@/lib/glass-popup";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import { readCachedInventory, writeCachedInventory } from "@/lib/connected-apps-cache";
import { reserveConnectionPage, reusableConnectionUrl, type PendingAuthorization } from "@/lib/connector-oauth";
import { mcpSignInLink } from "@/lib/mcp-sign-in";
import { useMcpServers } from "@/lib/mcp-servers";
import { pollConnector } from "@/lib/connector-poll";
import { connectorConnect } from "@/lib/product-events";
import { managedConnectorUnavailableReason } from "../../shared/connector-availability";
import { connectorServiceAccess, isConnectorToolGrantShape } from "@/lib/connector-grants";
import {
  accountAliasTaken,
  accountToReconnect,
  connectedInventoryCopy,
  connectorActionLabel,
  hasActiveConnection,
  needsReconnect,
  requiresAccountAlias,
  type ConnectorAccount,
  type ConnectorInventoryPhase,
  type ConnectorStatus,
} from "@/lib/connector-status";
import { BotAvatar } from "./Avatar";
import { SidebarPopoverMenu } from "./SidebarPopoverMenu";
import { appCategoryLabel, CATEGORY_SECTION_SIZE, catalogSections, connectorDescription, inCategory, rankCategories } from "@/lib/app-catalog";
import { McpServersPanel } from "./McpServersPanel";
import { explainVerifyFailure } from "../../shared/mcp-credentials.ts";
import { VERIFY_OUTCOME_LABEL, verifyOutcome } from "../../shared/verify-outcome.ts";
import { McpCredentialsDialog } from "./McpCredentialsDialog";
import { mergeCompleteConnectorStatus, mergeCurrentConnectorStatus, onlyLatestConnectorResponses } from "@/lib/connector-status-merge";
import { openBotSettings } from "./bot-panel/panel-link";
import { openKeySettings } from "./keys/key-focus";
import { ServiceIcon, type ToolkitCard } from "./ServiceIcon";
export { ServiceIcon, type ToolkitCard } from "./ServiceIcon";

let cachedConnectorStatus: Record<string, ConnectorStatus> | null = null;
let cachedConnectorStatusAt = 0;
let cachedConnectorStatusAuthoritative = true;
let connectorStatusRequest: Promise<ConnectorInventory> | null = null;
const CONNECTOR_STATUS_CACHE_MS = 30_000;

export interface ConnectorInventory {
  services: Record<string, ConnectorStatus>;
  /** false when the server could not read the credential store: nothing may be cleared on the strength of it. */
  authoritative: boolean;
}

export function preloadConnectedApps(force = false, background = false): Promise<ConnectorInventory> { // background: src/state/api.ts
  if (!force && cachedConnectorStatus !== null && Date.now() - cachedConnectorStatusAt < CONNECTOR_STATUS_CACHE_MS) {
    return Promise.resolve({
      services: cachedConnectorStatus,
      authoritative: cachedConnectorStatusAuthoritative,
    });
  }
  if (connectorStatusRequest) return connectorStatusRequest;
  connectorStatusRequest = api("/api/connectors/connected", background ? { background: true } : undefined)
    .then((response: { services?: Record<string, ConnectorStatus>; credentialStore?: string; inventoryComplete?: boolean }) => {
      const services: Record<string, ConnectorStatus> = response.services ?? {};
      if (response.credentialStore === "unavailable" || response.inventoryComplete === false) {
        cachedConnectorStatusAuthoritative = false;
        return { services: readCachedInventory()?.services ?? services, authoritative: false };
      }
      cachedConnectorStatus = services;
      cachedConnectorStatusAt = Date.now();
      cachedConnectorStatusAuthoritative = true;
      writeCachedInventory(services, Date.now());
      return { services, authoritative: true };
    })
    .catch(() => ({ services: readCachedInventory()?.services ?? {}, authoritative: false }))
    .finally(() => {
      connectorStatusRequest = null;
    });
  return connectorStatusRequest;
}

export function disconnectAccountConfirmation(
  service: string,
  account: { id: string; alias?: string },
) {
  const identity = account.alias ? `“${account.alias}” (${account.id})` : `“${account.id}”`;
  return t("connectors.disconnectConfirm", { identity, service });
}

export function botsMissingConnectedApps(bots: Bot[], instances: InstanceInfo[]): Bot[] {
  return bots.filter((bot) =>
    !bot.hidden &&
    bot.composio === false &&
    instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId)
      ?.capabilities?.composioMcp === true);
}

export function botsWithLimitedServiceTools(bots: Bot[], instances: InstanceInfo[], slug: string): Bot[] {
  return bots.filter((bot) => {
    if (bot.hidden || bot.composio === false) return false;
    if (!instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId)
      ?.capabilities?.composioMcp) return false;
    const record: unknown = bot.connectorTools;
    if (!record || typeof record !== "object" || Array.isArray(record)) return false;
    const grant = (record as Record<string, unknown>)[slug];
    if (grant === undefined) return true;
    return !isConnectorToolGrantShape(grant) || grant.tools !== "*";
  });
}

export function hasUsableConnectedApps(configured: boolean, phase: ConnectorInventoryPhase, stale: boolean, status: Record<string, ConnectorStatus>): boolean {
  return configured && phase === "ready" && !stale && Object.values(status).some((service) => service.connected);
}

export type ConnectorSetup = "ready" | "needs-setup" | "service-unavailable";

export function connectorSetupNotice(state: {
  configured: boolean;
  stale: boolean;
  setup: ConnectorSetup | undefined;
  remoteClient: boolean;
}): { key: LocaleKey; tone: "info" | "warning" } | null {
  if (state.configured || state.stale) return null;
  if (state.setup === "needs-setup") {
    return { key: state.remoteClient ? "connectors.setupNeededRemote" : "connectors.setupNeeded", tone: "info" };
  }
  return { key: "connectors.notConfigured", tone: "warning" };
}

export interface CatalogPagination {
  items: number;
  totalItems?: number;
  stalled: boolean;
  reason?: string;
}

export type AppsFilter = "all" | "connected" | "mcp";

export const APPS_PREVIEW_COUNT = 48;

export const USED_BY_AVATAR_SIZE = 16;

export function botsUsingService(bots: Bot[], instances: InstanceInfo[], slug: string): Bot[] {
  return bots.filter((bot) =>
    !bot.hidden &&
    bot.composio !== false &&
    instances.find((instance) => instance.instanceId === bot.modelSelection.instanceId)
      ?.capabilities?.composioMcp === true &&
    connectorServiceAccess(bot.connectorTools, slug).level !== "none");
}

/** The tools shipped as MCP presets, shown with their own marks above the marketplace grid.
 * These all work on a mainland connection: fill the credential (or scan a QR code) and verify. */
export const LOCAL_APPS = [
  { id: "wechat", name: "微信", blurb: "个人微信收发消息", note: "这里不填凭证。启用后对任意助手说「登录微信」，它会弹出二维码，用手机微信扫码即登录。", icon: "/app-icons/wechat.svg", needsCredentials: false },
  { id: "qq", name: "QQ 机器人", blurb: "QQ 官方机器人：群/频道消息、文件", icon: "/app-icons/qq.png" },
  { id: "tencent-meeting", name: "腾讯会议", blurb: "预约会议、录制转写、AI 纪要（官方 MCP）", icon: "/app-icons/tencent-meeting.png" },
  { id: "qqmail", name: "QQ 邮箱", blurb: "收发邮件、搜索、下载附件", icon: "/app-icons/qqmail.ico" },
  { id: "tencent-docs", name: "腾讯文档", blurb: "在线文档、智能表格、智能文档", icon: "/app-icons/tencent-docs.ico" },
  { id: "feishu", name: "飞书", blurb: "文档、多维表格、消息与日历", icon: "/app-icons/feishu.ico" },
  { id: "dingtalk", name: "钉钉", blurb: "通讯录、日程、待办、群机器人", icon: "/app-icons/dingtalk.ico" },
  { id: "wecom", name: "企业微信", blurb: "群机器人发消息、图片、文件", icon: "/app-icons/wecom.ico" },
  { id: "yuque", name: "语雀", blurb: "知识库、文档与团队统计", icon: "/app-icons/yuque.ico" },
  { id: "tapd", name: "TAPD", blurb: "需求、任务、缺陷、迭代", icon: "/app-icons/tapd.ico" },
  { id: "gitee", name: "Gitee", blurb: "仓库、Issue、Pull Request", icon: "/app-icons/gitee.ico" },
  { id: "baidu-pan", name: "百度网盘", blurb: "文件列表、搜索、分享（官方 MCP）", icon: "/app-icons/baidu-pan.ico" },
  { id: "obsidian", name: "Obsidian", blurb: "本地知识库：笔记读写、搜索、标签", icon: "/app-icons/obsidian.ico" },
  { id: "chrome", name: "Chrome 浏览器", blurb: "网页操作、截图、控制台（无需凭证）", icon: "/app-icons/chrome.svg", needsCredentials: false },
  { id: "jimeng", name: "即梦", blurb: "AI 文生图 / 图生视频（火山引擎即梦）", icon: "/app-icons/jimeng.png" },
  { id: "remotion", name: "Remotion", blurb: "用 React 代码生成视频、批量渲染（无需凭证）", icon: "/app-icons/remotion.png", needsCredentials: false },
  { id: "chatcut", name: "ChatCut", blurb: "AI 剪辑：口播去口癖、字幕、动效、配音（登录授权）", icon: "/app-icons/chatcut.png", needsCredentials: false },
  { id: "capcut", name: "剪映 / CapCut", blurb: "写入本机剪映草稿：时间轴、字幕、关键帧（无需凭证）", icon: "/app-icons/capcut.png", needsCredentials: false },
  { id: "gmail", name: "Gmail", blurb: "收发邮件、搜索（应用专用密码）", icon: "/app-icons/gmail.png" },
  { id: "github", name: "GitHub", blurb: "议题、拉取请求、代码（个人令牌）", icon: "/app-icons/github.png" },
];

/** Gmail and GitHub now connect locally (their own MCP presets), so the overseas
 * marketplace must not show a second, dead "Connect" row for them. */
const DUPLICATE_TOP_SLUGS = new Set(["gmail", "github"]);

/** A proxy or login wall answers with an HTML document; showing it raw tells the person nothing. */
function readableError(text: string): string {
  const head = text.trimStart().slice(0, 220).toLowerCase();
  if (head.startsWith("<") || head.includes("<html") || head.includes("<!doctype")) {
    return "海外连接服务返回了网页错误页，已切换到本地应用目录；上面的工具填好凭证即可使用。";
  }
  if (/connected-apps service|proxy or gateway|answered with a web page|http 404/.test(head)) {
    return "海外连接服务暂不可用，已切换到本地应用目录；上面的工具填好凭证即可使用。";
  }
  return text;
}

export function PluginsPanel() {
  const { state, dispatch } = useStore();
  // The four mainland presets live in the MCP list, not the Composio catalog: read that list so
  // a configured tool still shows up under "connected" instead of only in the marketplace.
  const { servers: mcpServers } = useMcpServers();
  const remoteClient = window.ogb?.remoteClient?.active === true;
  const dialogRef = useRef<HTMLDivElement>(null);
  const surface = state.pluginsSurface;
  const [cards, setCards] = useState<ToolkitCard[] | null>(null);
  const [source, setSource] = useState<"api" | "curated" | "local">("curated");
  const [pagination, setPagination] = useState<CatalogPagination | null>(null);
  const [configured, setConfigured] = useState(false);
  const [mode, setMode] = useState<"managed" | "self-hosted" | "unavailable">("unavailable");
  const [setup, setSetup] = useState<ConnectorSetup | undefined>(undefined);
  const [status, setStatus] = useState<Record<string, ConnectorStatus>>(
    () => cachedConnectorStatus ?? readCachedInventory()?.services ?? {},
  );
  const [stale, setStale] = useState(
    cachedConnectorStatus !== null && !cachedConnectorStatusAuthoritative,
  );
  const [pendingUrls, setPendingUrls] = useState<Record<string, PendingAuthorization>>({});
  const [aliasSlug, setAliasSlug] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [inventoryPhase, setInventoryPhase] = useState<ConnectorInventoryPhase>(
    cachedConnectorStatus === null ? "loading" : "ready",
  );
  const [error, setError] = useState<string | { key: LocaleKey } | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"marketplace" | "connected">("marketplace");
  const [showAllApps, setShowAllApps] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  // A green dot alone claimed the tool worked; this is the result of actually starting it.
  const [localProbes, setLocalProbes] = useState<Record<string, { state: "running" } | { state: "ok"; tools: number } | { state: "fail"; error: string }>>({});
  /** Which preset the credential dialog is open for, and a nudge for the embedded MCP list. */
  const [credentialName, setCredentialName] = useState<string | null>(null);
  const [mcpRefreshKey, setMcpRefreshKey] = useState(0);

  const polls = useRef(new Map<string, () => void>());
  const statusGenerations = useRef(new Map<string, number>());
  const latestStatusRequests = useRef(new Map<string, number>());
  const opening = useRef<ReturnType<typeof reserveConnectionPage> | null>(null);

  /** A connection that finished or failed since a request no newer than this one no longer needs its sign-in page. */
  const forgetSettledUrls = (services: Record<string, ConnectorStatus>, requestGenerations: ReadonlyMap<string, number>) => {
    const settled = Object.entries(services).filter(([slug, state]) => (statusGenerations.current.get(slug) ?? 0) === (requestGenerations.get(slug) ?? 0)
      && ((state.connected && !state.pending) || /^(expired|failed)$/i.test(state.status ?? ""))).map(([slug]) => slug);
    if (settled.length) setPendingUrls((current) => settled.some((slug) => current[slug]) ? Object.fromEntries(Object.entries(current).filter(([slug]) => !settled.includes(slug))) : current);
  };
  const refreshStatus = useCallback((slugs: string[]): Promise<Record<string, ConnectorStatus>> => {
    if (!slugs.length) return Promise.resolve({});
    const requestGenerations = new Map(slugs.map((slug) => [slug, statusGenerations.current.get(slug) ?? 0]));
    const requestIds = new Map(slugs.map((slug) => {
      const requestId = (latestStatusRequests.current.get(slug) ?? 0) + 1;
      latestStatusRequests.current.set(slug, requestId);
      return [slug, requestId];
    }));
    return api(`/api/connectors?services=${slugs.join(",")}`)
      .then((r) => {
        const services = onlyLatestConnectorResponses(
          r.services ?? {},
          latestStatusRequests.current,
          requestIds,
        );
        // A one-service poll must not erase other apps' state, and a request older than Connect must not erase the
        // newer INITIATED state.
        setStatus((current) => mergeCurrentConnectorStatus(
          current,
          services,
          statusGenerations.current,
          requestGenerations,
        ));
        forgetSettledUrls(services, requestGenerations);
        return services;
      })
      .catch(() => ({}));
  }, []);

  const refreshConnectedStatus = useCallback((force = false): Promise<Record<string, ConnectorStatus>> => {
    const requestGenerations = new Map(statusGenerations.current);
    setRefreshing(true);
    return preloadConnectedApps(force)
      .then(({ services, authoritative }) => {
        setStale(!authoritative);
        setStatus((current) => mergeCompleteConnectorStatus(
          current,
          services,
          statusGenerations.current,
          requestGenerations,
          authoritative,
        ));
        forgetSettledUrls(services, requestGenerations);
        return services;
      })
      .finally(() => setRefreshing(false));
  }, []);

  const loadConnectionInventory = useCallback((force = false) => {
    const hadCachedInventory = cachedConnectorStatus !== null;
    if (!hadCachedInventory) setInventoryPhase("loading");
    setError(null);
    return refreshConnectedStatus(force)
      .then((services) => {
        setInventoryPhase("ready");
        return services;
      })
      .catch((cause) => {
        if (!hadCachedInventory) setInventoryPhase("error");
        setError(cause instanceof Error ? cause.message : String(cause));
        return {};
      });
  }, [refreshConnectedStatus]);

  useEffect(() => () => {
    opening.current?.cancel();
    opening.current = null;
    for (const stop of polls.current.values()) stop();
    polls.current.clear();
  }, []);

  useEffect(() => {
    if (inventoryPhase !== "ready") return;
    cachedConnectorStatus = status;
    cachedConnectorStatusAt = Date.now();
    cachedConnectorStatusAuthoritative = !stale;
  }, [inventoryPhase, stale, status]);

  useEffect(() => {
    let alive = true;
    void loadConnectionInventory();
    api("/api/connectors/catalog")
      .then((r) => {
        if (!alive) return;
        setCards(r.cards ?? []);
        setSource(r.source ?? "curated");
        setPagination(r.pagination ?? null);
        setConfigured(Boolean(r.configured));
        setMode(r.mode ?? "unavailable");
        setSetup(r.setup);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [loadConnectionInventory]);

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);

    const controls = focusable();
    (controls.find((element) => element.matches("input")) ?? controls[0] ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dispatch({ type: "togglePlugins", open: false });
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items.at(-1)!;
      if (!items.some((element) => element === document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      returnFocus?.focus();
    };
  }, [dispatch]);

  const openConnectUrl = async (url: string) => {
    if (opening.current) return;
    const launch = reserveConnectionPage();
    opening.current = launch;
    try {
      if (!await launch.open(url) && opening.current === launch) {
        setError({ key: "connectors.popupBlockedContinue" });
      }
    } finally {
      launch.cancel();
      if (opening.current === launch) opening.current = null;
    }
  };

  const startPolling = (slug: string, before: ConnectorStatus | undefined) => {
    polls.current.get(slug)?.();
    const stop = pollConnector(before, () => refreshStatus([slug]).then((services) => services[slug]), (result) => {
      if (polls.current.get(slug) === stop) polls.current.delete(slug);
      connectorConnect(slug, result);
    });
    polls.current.set(slug, stop);
  };

  const connect = async (slug: string, alias?: string, replacing?: ConnectorAccount) => {
    if (busySlug || opening.current) return;
    const launch = reserveConnectionPage();
    opening.current = launch;
    statusGenerations.current.set(slug, (statusGenerations.current.get(slug) ?? 0) + 1);
    setBusySlug(slug);
    setError(null);
    try {
      const createdAt = Date.now();
      if (replacing) await api(`/api/connectors/${slug}/accounts/${encodeURIComponent(replacing.id)}`, { method: "DELETE" });
      const request: RequestInit = { method: "POST" };
      if (alias) request.body = JSON.stringify({ alias });
      const result = await api(`/api/connectors/${slug}/authorize`, request);
      if (opening.current !== launch) return;
      const url = mcpSignInLink(typeof result.url === "string" ? result.url : null);
      if (!url) throw new Error(t("connectors.invalidAuthorizationUrl"));
      setPendingUrls((current) => ({ ...current, [slug]: { url, createdAt } }));
      setStatus((current) => ({
        ...current,
        [slug]: {
          ...current[slug],
          connected: current[slug]?.connected ?? false,
          pending: true,
          status: "INITIATED",
        },
      }));
      setAliasSlug(null);
      setAliasDraft("");
      startPolling(slug, status[slug]);
      if (!await launch.open(url) && opening.current === launch) {
        setError({ key: "connectors.popupBlockedContinue" });
      }
    } catch (e) {
      if (opening.current !== launch) return;
      const message = e instanceof Error ? e.message : String(e);
      if (requiresAccountAlias(message)) {
        setAliasSlug(slug);
        setAliasDraft("");
        setError({ key: "connectors.aliasNeeded" });
        void refreshStatus([slug]);
      } else {
        setError(accountAliasTaken(message) ? { key: "connectors.aliasTaken" } : message);
      }
    } finally {
      launch.cancel();
      if (opening.current === launch) {
        opening.current = null;
        setBusySlug(null);
      }
    }
  };

  const disconnectAccount = (slug: string, accountId: string) => {
    setBusySlug(slug);
    api(`/api/connectors/${slug}/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" })
      .then(() => refreshStatus([slug]))
      .catch((e) => setError(e.message))
      .finally(() => setBusySlug(null));
  };

  // When the overseas marketplace is down the server serves a bundled catalog. Its local tools
  // already have their own rows above, so only the remaining overseas apps stay in this grid.
  const localCatalog = source === "local";
  const localIds = new Set(LOCAL_APPS.map((app) => app.id));
  const matching = (cards ?? []).filter((c) => (!localCatalog || !localIds.has(c.slug))
    && (!managedConnectorUnavailableReason(mode, c.slug) || hasActiveConnection(status[c.slug]))
    && (!search || `${c.label} ${c.slug} ${connectorDescription(c)}`.toLowerCase().includes(search.toLowerCase())));
  const isConnected = (slug: string) => Boolean(status[slug]?.connected || status[slug]?.accounts?.length);
  const filter: AppsFilter = surface === "mcp" ? "mcp" : tab === "connected" ? "connected" : "all";
  const visible = (filter === "connected" ? matching.filter((card) => isConnected(card.slug)) : matching)
    .map((card, index) => ({ card, index }))
    .sort((a, b) => Number(isConnected(b.card.slug)) - Number(isConnected(a.card.slug)) || a.index - b.index)
    .map(({ card }) => card);
  const enabledMcpNames = new Set((mcpServers ?? []).filter((server) => server.enabled && !server.bot).map((server) => server.name));
  const localApps = LOCAL_APPS.map((app) => ({ ...app, connected: enabledMcpNames.has(app.id) }));
  const connectedLocalApps = localApps.filter((app) => app.connected);
  const connectedCount = Object.values(status).filter(hasActiveConnection).length + connectedLocalApps.length;
  const connectedEmptyCopy = connectedInventoryCopy(inventoryPhase);
  const close = () => dispatch({ type: "togglePlugins", open: false });
  const setupNotice = connectorSetupNotice({ configured, stale, setup, remoteClient });
  const botsWithoutApps = hasUsableConnectedApps(configured, inventoryPhase, stale, status)
    ? botsMissingConnectedApps(state.bots, state.instances)
    : [];
  const probeLocal = (name: string) => {
    setLocalProbes((current) => ({ ...current, [name]: { state: "running" } }));
    void api<{ ok: boolean; tools?: unknown[]; error?: string }>(`/api/mcp/servers/${encodeURIComponent(name)}/test`, { method: "POST" })
      .then((result) => setLocalProbes((current) => ({
        ...current,
        [name]: result.ok ? { state: "ok", tools: result.tools?.length ?? 0 } : { state: "fail", error: (result.error ?? "").trim() },
      })))
      .catch((cause) => setLocalProbes((current) => ({
        ...current,
        [name]: { state: "fail", error: cause instanceof Error ? cause.message : String(cause) },
      })));
  };

  const chooseFilter = (next: AppsFilter) => {
    setCategory(null);
    if (next === "mcp") {
      dispatch({ type: "togglePlugins", open: true, surface: "mcp" });
      return;
    }
    setTab(next === "connected" ? "connected" : "marketplace");
    if (surface !== "apps") dispatch({ type: "togglePlugins", open: true, surface: "apps" });
  };

  const ranked = rankCategories([...(cards ?? [])], undefined, []);
  const moreCategories = ranked.more;
  const categoryInMore = category !== null && moreCategories.includes(category);
  const inCategoryView = filter === "all" && category !== null;
  const nativeCardsShown = false;
  const categoryCards = inCategoryView ? visible.filter((card) => inCategory(card, category)) : visible;
  const sectioned = filter === "all" && !search && category === null;
  const sections = sectioned ? catalogSections(visible, isConnected, ranked.inline) : [];
  const allSection = sections.find((section) => section.kind === "all");
  const allCards = sectioned ? allSection?.cards ?? [] : categoryCards;
  const allCapped = sectioned && !showAllApps && allCards.length > APPS_PREVIEW_COUNT;
  const allShown = allCapped ? allCards.slice(0, APPS_PREVIEW_COUNT) : allCards;
  const connectedCards = (cards ?? []).filter((card) => hasActiveConnection(status[card.slug]));
  const pickCategory = (next: string | null) => {
    setCategory(next);
    setTab("marketplace");
    if (surface !== "apps") dispatch({ type: "togglePlugins", open: true, surface: "apps" });
  };
  // With only local tools connected, the cloud list has no rows at all; its heading stays hidden.
  const cloudListEmpty = filter === "connected" && connectedLocalApps.length > 0
    && cards !== null && allShown.length === 0 && !nativeCardsShown;
  const listTitle = filter === "connected"
    ? t("connectors.section.yours")
    : search
      ? t("connectors.section.results")
      : category ? appCategoryLabel(category) : (sections.length > 1 ? t("apps.section.all") : t("connectors.section.available"));
  const catalogUnavailable = typeof error === "string"
    && /connected-apps service|proxy or gateway|answered with a web page|HTTP 404/i.test(error);
  const pill = "inline-flex h-7 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-ui font-medium leading-5 transition-colors";
  const pillTone = (selected: boolean) => selected
    ? "bg-ink text-app"
    : "bg-control/70 text-ink-secondary hover:bg-raised-hover hover:text-ink";

  return (
    <div
      className="glass-popup-frame"
      style={glassPopupFrameStyle()}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      {/* A sibling, not the parent: a backdrop-filter on an ancestor would stop the pop-up's own glass from seeing the app behind it. */}
      <div aria-hidden="true" className="glass-scrim pointer-events-none absolute inset-0" />
      <div
        ref={dialogRef}
        data-tour="apps-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugins-title"
        tabIndex={-1}
        className="glass-surface glass-popup animate-pop-in relative flex max-w-[780px] flex-col overflow-hidden rounded-2xl"
      >
        <header className="flex flex-col gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <div>
          <div className="flex items-center justify-between gap-3">
            <h2 id="plugins-title" className="min-w-0 truncate text-page font-semibold leading-7 tracking-[-0.01em] text-ink">{t("apps.title")}</h2>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-apps-filter="connected"
                aria-pressed={filter === "connected"}
                onClick={() => chooseFilter(filter === "connected" ? "all" : "connected")}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-full ps-1.5 pe-2 text-ui font-medium leading-5 transition-colors",
                  filter === "connected" ? "bg-raised text-ink" : "text-ink-secondary hover:bg-raised/60 hover:text-ink",
                )}
              >
                {connectedCards.length > 0 && (
                  <span aria-hidden="true" className="flex -space-x-1.5 rtl:space-x-reverse">
                    {connectedCards.slice(0, 4).map((card) => (
                      <span key={card.slug} className="flex size-5 items-center justify-center overflow-hidden rounded-md bg-menu ring-2 ring-menu">
                        <ServiceIcon card={card} className="size-5 rounded-md" />
                      </span>
                    ))}
                  </span>
                )}
                <span className="whitespace-nowrap">
                  {connectedCount > 0 ? t("apps.connectedCount", { count: connectedCount }) : t("apps.filter.connected")}
                </span>
                <ChevronRight size={14} aria-hidden="true" className="shrink-0 rtl:-scale-x-100" />
              </button>
              <button
                onClick={() => { void loadConnectionInventory(true); }}
                disabled={refreshing}
                className="flex size-8 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink disabled:opacity-50"
                title={t("connectors.refreshTitle")}
                aria-label={t("connectors.refreshTitle")}
              >
                <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
              </button>
              <button data-tour="apps-close"
                onClick={close}
                aria-label={t("connectors.closeAria")}
                className="flex size-8 items-center justify-center rounded-full text-ink-secondary hover:bg-raised hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <p className="mt-0.5 text-ui leading-5 text-ink-secondary">{t("apps.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-control/70 px-3.5 focus-within:ring-1 focus-within:ring-accent">
              <Search size={15} className="shrink-0 text-ink-secondary" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("connectors.searchPlaceholder")}
                aria-label={t("connectors.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-ink-secondary focus:outline-none"
              />
            </label>
            <button
              type="button"
              data-apps-filter="mcp"
              aria-pressed={filter === "mcp"}
              onClick={() => chooseFilter(filter === "mcp" ? "all" : "mcp")}
              className={cn(pill, "h-9 border border-hairline/40 px-3.5", filter === "mcp" ? "bg-ink text-app" : "text-ink hover:bg-raised")}
            >
              <Server size={14} aria-hidden="true" />
              <span className="hidden sm:inline">{t("apps.filter.mcp")}</span>
              <span className="sr-only sm:hidden">{t("apps.filter.mcp")}</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("apps.categoriesAria")}>
            <button
              type="button"
              data-apps-filter="all"
              aria-pressed={filter === "all" && category === null}
              onClick={() => { chooseFilter("all"); setCategory(null); }}
              className={cn(pill, pillTone(filter === "all" && category === null))}
            >
              {t("apps.filter.all")}
            </button>
            {ranked.inline.map((name) => (
              <button
                key={name}
                type="button"
                data-apps-category={name}
                aria-pressed={filter === "all" && category === name}
                onClick={() => pickCategory(category === name ? null : name)}
                className={cn(pill, pillTone(filter === "all" && category === name))}
              >
                {appCategoryLabel(name)}
              </button>
            ))}
            {moreCategories.length > 0 && (
              <SidebarPopoverMenu
                ariaLabel={t("apps.moreCategories")}
                items={moreCategories.map((name) => ({ key: name, label: appCategoryLabel(name), active: category === name, onSelect: () => pickCategory(name) }))}
                renderTrigger={({ open }) => (
                  <span className={cn(pill, pillTone(filter === "all" && categoryInMore), open && !categoryInMore && "bg-raised-hover text-ink")}>
                    {categoryInMore ? appCategoryLabel(category) : t("apps.more")}
                    <ChevronDown size={14} aria-hidden="true" />
                  </span>
                )}
              />
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-7 sm:px-7">
          {stale && (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-ui text-warning">
              <TriangleAlert size={14} className="mt-px shrink-0" />
              <span>
                {t("connectors.stale")}
              </span>
            </div>
          )}
          {localCatalog && !configured && filter !== "mcp" && (
            <div className="mb-3 rounded-xl bg-control/50 px-3 py-2 text-note leading-relaxed text-ink-secondary">
              海外在线连接服务暂不可用，已自动切换为本地应用目录：上面的微信 / QQ / 腾讯会议等国内工具，以及 Gmail、GitHub，填好凭证即可使用。需要接入海外应用时，点下方应用卡片上的「配置连接服务」填入自己的连接服务密钥。
            </div>
          )}
          {!localCatalog && setupNotice && filter !== "mcp" && (
            <div
              className={cn(
                "mb-3 rounded-xl px-4 py-3 text-ui",
                setupNotice.tone === "warning" ? "bg-warning/10 text-warning" : "bg-control/50 text-ink-secondary",
              )}
            >
              {t(setupNotice.key)}{" "}
              <button
                className={cn(
                  "font-medium underline underline-offset-2",
                  setupNotice.tone === "info" && "text-ink",
                  remoteClient && "hidden",
                )}
                onClick={() => { close(); dispatch(openKeySettings("composio")); }}
              >
                {t("connectors.openSettings")}
              </button>
            </div>
          )}
          {botsWithoutApps.length > 0 && (
            <div className="mb-3 rounded-xl bg-control/50 px-4 py-3 text-ui leading-relaxed text-ink-secondary">
              <span className="font-medium text-ink">{t("connectors.perBot.title")}</span>{" "}
              {t("connectors.perBot.body")}
              <div className="mt-2 flex flex-wrap gap-2">
                {botsWithoutApps.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => dispatch({ type: "updateBot", botId: candidate.id, patch: { composio: true } })}
                    className={cn(pill, "bg-control text-ink hover:bg-raised-hover")}
                  >
                    {t("connectors.perBot.allow", { name: candidate.name })}
                  </button>
                ))}
              </div>
            </div>
          )}
          {configured && !remoteClient && source === "curated" && mode === "self-hosted" && filter !== "mcp" && (
            <div className="mb-3 text-note text-ink-secondary">
              {t("connectors.featuredBefore")}{" "}
              <button
                className="underline underline-offset-2 hover:text-ink"
                onClick={() => {
                  close();
                  dispatch({ type: "toggleAppSettings", open: true });
                }}
              >
                {t("connectors.updateKey")}
              </button>{" "}
              {t("connectors.featuredAfter")}
            </div>
          )}
          {error && !localCatalog && <div role="alert" className={cn("mb-3 rounded-xl px-3 py-2 text-note", catalogUnavailable ? "bg-control/60 text-ink-secondary" : "bg-danger/10 text-danger")}>{typeof error === "string" ? readableError(error) : t(error.key)}</div>}

          {filter !== "mcp" && (
            <div data-apps-grid className="@container flex flex-col gap-7 pt-1">
              {sections.filter((section) => section.kind !== "all").map((section) => {
                const shown = section.kind === "connected"
                  ? section.cards.slice(0, CATEGORY_SECTION_SIZE)
                  : section.cards.filter((card) => !DUPLICATE_TOP_SLUGS.has(card.slug)).slice(0, CATEGORY_SECTION_SIZE);
                if (!shown.length) return null;
                return section.kind === "connected" ? (
                  <AppsSection
                    key="connected"
                    id="apps-section-connected"
                    title={t("apps.section.connected")}
                    viewAll={section.cards.length > CATEGORY_SECTION_SIZE ? { label: t("apps.viewAll"), onClick: () => chooseFilter("connected") } : undefined}
                  >
                    {shown.map((card) => renderTile(card))}
                  </AppsSection>
                ) : (
                  <AppsSection
                    key={section.category}
                    id={`apps-section-${section.category}`}
                    title={appCategoryLabel(section.category)}
                    viewAll={section.more ? { label: t("apps.viewAll"), onClick: () => pickCategory(section.category) } : undefined}
                  >
                    {shown.map((card) => renderTile(card))}
                  </AppsSection>
                );
              })}
              {filter === "connected" && connectedLocalApps.length > 0 && (
                <AppsSection id="apps-local-connected" title="本地工具">
                  {connectedLocalApps.map((app) => renderLocalTile(app))}
                </AppsSection>
              )}
              {filter === "all" && !search && category === null && (
                <AppsSection id="apps-local-title" title="本地工具">
                  {localApps.map((app) => renderLocalTile(app))}
                </AppsSection>
              )}
              {!cloudListEmpty && <AppsSection
                id="apps-grid-title"
                title={listTitle}
                note={filter === "all" && !search && category === null && pagination
                  && (pagination.stalled || (pagination.totalItems !== undefined && pagination.items < pagination.totalItems))
                  ? `${pagination.totalItems !== undefined && pagination.items < pagination.totalItems
                    ? t("connectors.marketplace.partialCount", {
                      shown: pagination.items.toLocaleString(),
                      total: pagination.totalItems.toLocaleString(),
                    })
                    : t("connectors.marketplace.partialStalled")}${pagination.reason
                    ? ` — ${t("connectors.marketplace.partialReason", { reason: pagination.reason })}`
                    : ""}`
                  : undefined}
                viewAll={allCapped ? { label: t("apps.viewAll"), onClick: () => setShowAllApps(true) } : undefined}
                after={(
                  <>
                    {cards === null && (
                      <div className="flex items-center justify-center gap-2 py-24 text-ui text-ink-secondary">
                        <Loader2 size={14} className="animate-spin" /> {t("connectors.loadingCatalog")}
                      </div>
                    )}
                    {allCapped && (
                      <div className="mt-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setShowAllApps(true)}
                          className={cn(pill, "bg-control/70 px-4 text-ink hover:bg-raised-hover")}
                        >
                          {t("apps.showAll", { count: allCards.length.toLocaleString() })}
                        </button>
                      </div>
                    )}
                    {cards !== null && allShown.length === 0 && !nativeCardsShown && sections.length <= 1
                      && !(filter === "connected" && connectedLocalApps.length > 0) && (
                      <div className="flex min-h-40 flex-col items-center justify-center text-center">
                        <div className="text-body font-medium text-ink">
                          {filter === "connected" ? connectedEmptyCopy.title : t("connectors.noAppsFound")}
                        </div>
                        <div className="mt-1 text-ui text-ink-secondary">
                          {filter === "connected" ? connectedEmptyCopy.description : t("connectors.tryDifferentSearch")}
                        </div>
                        {filter === "connected" && inventoryPhase === "error" && (
                          <button
                            type="button"
                            disabled={refreshing}
                            onClick={() => void loadConnectionInventory(true)}
                            className={cn(pill, "mt-4 bg-raised text-ink hover:bg-raised-hover disabled:opacity-50")}
                          >
                            <RefreshCw size={14} className={cn(refreshing && "animate-spin")} />
                            {t("connectors.action.retry")}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              >
                {allShown.map((card) => renderTile(card))}
              </AppsSection>}
            </div>
          )}

          {filter !== "connected" && category === null && (
            <div className={cn(filter === "all" && "mt-8 border-t border-hairline/30 pt-6", filter === "mcp" && "pt-1")}>
              <McpServersPanel embedded hideWhop={filter === "all"} refreshKey={mcpRefreshKey} />
            </div>
          )}
        </div>
      </div>
      {credentialName && (
        <McpCredentialsDialog
          name={credentialName}
          title={LOCAL_APPS.find((app) => app.id === credentialName)?.name ?? credentialName}
          onClose={() => setCredentialName(null)}
          onSaved={() => setMcpRefreshKey((key) => key + 1)}
        />
      )}
    </div>
  );

  /** A local MCP preset wears the same row as a catalog app: mark, name, what it does, one action. */
  function renderLocalTile(app: (typeof LOCAL_APPS)[number] & { connected: boolean }) {
    const probe = localProbes[app.id];
    return (
      <div
        key={app.id}
        data-app-tile={`local-${app.id}`}
        className="flex min-w-0 flex-col rounded-xl px-2 py-2 transition-colors hover:bg-raised/40"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white">
            <img src={app.icon} alt="" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-body font-semibold leading-5 text-ink">{app.name}</span>
              {probe?.state === "ok" && (
                <Check size={13} strokeWidth={2.5} className="shrink-0 text-success" aria-label="已验证" />
              )}
            </div>
            <div className="truncate text-ui leading-[18px] text-ink-secondary">{app.blurb}</div>
            {"note" in app && app.note && (
              <div className="mt-0.5 text-meta leading-4 text-ink-tertiary">{app.note}</div>
            )}
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-meta leading-4">
              <button
                type="button"
                onClick={() => probeLocal(app.id)}
                disabled={probe?.state === "running"}
                className="shrink-0 rounded px-1 py-0.5 font-medium text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-50"
              >
                验证
              </button>
              {app.needsCredentials !== false && (
                <button
                  type="button"
                  onClick={() => setCredentialName(app.id)}
                  className="shrink-0 rounded px-1 py-0.5 font-medium text-ink-secondary hover:bg-control hover:text-ink"
                >
                  凭证
                </button>
              )}
              {probe?.state === "running" && <span className="truncate text-ink-secondary">正在启动服务…</span>}
              {probe?.state === "ok" && <span className="truncate text-success">已验证 · {probe.tools} 个工具</span>}
              {probe?.state === "fail" && (
                <span className="truncate text-danger" title={explainVerifyFailure(probe.error).message}>
                  {VERIFY_OUTCOME_LABEL[verifyOutcome({ ok: false, error: probe.error }).outcome]}
                </span>
              )}
              {!probe && <span className="truncate text-ink-tertiary">{app.connected ? "已启用，未验证" : "未启用"}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => app.connected || app.needsCredentials === false ? chooseFilter("mcp") : setCredentialName(app.id)}
            className="inline-flex h-7 min-w-[64px] shrink-0 items-center justify-center gap-2 rounded-full bg-control/80 px-3 text-ui font-medium leading-5 text-ink transition-colors hover:bg-raised-hover"
          >
            {app.connected ? "管理" : app.needsCredentials === false ? "启用" : "填写凭证"}
          </button>
        </div>
      </div>
    );
  }

  function renderTile(card: ToolkitCard) {
    const serviceStatus = status[card.slug];
    const failed = serviceStatus?.status && /^(expired|failed)$/i.test(serviceStatus.status);
    const pending = serviceStatus?.pending && !failed;
    const pendingAuthorization = pending && !failed ? pendingUrls[card.slug] : undefined;
    const authorizationUrl = reusableConnectionUrl(pendingAuthorization);
    const accounts = serviceStatus?.accounts ?? [];
    const included = card.noAuth === true
      || (serviceStatus?.connected === true && !accounts.length && !pending && !failed);
    const connected = hasActiveConnection(serviceStatus);
    const reconnect = pending ? undefined : accountToReconnect(serviceStatus);
    const addingAccount = aliasSlug === card.slug && !included;
    const busy = busySlug === card.slug;
    // Only an untouched overseas card offers the setup shortcut; an authorization
    // already in progress keeps its real Continue / Reconnect action.
    const setupNeeded = localCatalog && !configured && !pending && !reconnect && !included;
    const unavailableReason = managedConnectorUnavailableReason(mode, card.slug)
      ? t("connectors.selfHostOnlyReason")
      : null;
    const usedBy = connected || included ? botsUsingService(state.bots, state.instances, card.slug) : [];
    const description = unavailableReason ?? (
      pending
        ? authorizationUrl
          ? t("connectors.finishSetup")
          : t("connectors.finishSetupOrDisconnect")
        : reconnect
          ? t("connectors.signedOut")
          : failed && !accounts.length
            ? t("connectors.authExpired")
            : connectorDescription(card)
    );
    return (
      <div
        key={card.slug}
        data-app-tile={card.slug}
        className="flex min-w-0 flex-col rounded-xl px-2 py-2 transition-colors hover:bg-raised/40"
      >
        <div className="flex items-center gap-3">
          <ServiceIcon card={card} className="size-10 shrink-0 rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-body font-semibold leading-5 text-ink">{card.label}</span>
              {connected && !pending && (
                <Check size={13} strokeWidth={2.5} className="shrink-0 text-success" aria-label={t("apps.connected")} />
              )}
              {usedBy.length > 0 && (
                <span
                  className="ms-1 flex shrink-0 -space-x-1.5 rtl:space-x-reverse"
                  title={t("apps.usedBy", { names: usedBy.map((candidate) => candidate.name).join(", ") })}
                  aria-label={t("apps.usedBy", { names: usedBy.map((candidate) => candidate.name).join(", ") })}
                  role="img"
                >
                  {usedBy.slice(0, 3).map((candidate) => (
                    <span
                      key={candidate.id}
                      data-used-by-avatar={candidate.id}
                      className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-menu ring-2 ring-menu"
                    >
                      <BotAvatar bot={candidate} size={USED_BY_AVATAR_SIZE} animated={false} />
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div className="truncate text-ui leading-[18px] text-ink-secondary" title={description}>
              {description}
            </div>
          </div>
          <button
            type="button"
            disabled={setupNeeded ? false : (!configured || inventoryPhase !== "ready" || busy || included || Boolean(unavailableReason))}
            title={unavailableReason ?? undefined}
            onClick={() => {
              if (setupNeeded) { close(); dispatch(openKeySettings("composio")); return; }
              if (pending && !failed) {
                const url = reusableConnectionUrl(pendingAuthorization);
                if (url) {
                  setError(null);
                  void openConnectUrl(url).catch((e) => setError(e.message));
                } else {
                  void connect(card.slug);
                }
              } else if (reconnect) {
                void connect(card.slug, reconnect.alias, reconnect);
              } else {
                setAliasSlug((current) => current === card.slug ? null : card.slug);
                setAliasDraft("");
              }
            }}
            className="inline-flex h-7 min-w-[64px] shrink-0 items-center justify-center gap-2 rounded-full bg-control/80 px-3 text-ui font-medium leading-5 text-ink transition-colors hover:bg-raised-hover disabled:opacity-40"
          >
            {setupNeeded ? (
              "配置连接服务"
            ) : unavailableReason ? (
              t("connectors.selfHostOnly")
            ) : busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              connectorActionLabel(inventoryPhase, {
                busy,
                included,
                canContinue: Boolean(pendingAuthorization),
                pending,
                reconnect: Boolean(reconnect),
                hasAccounts: accounts.length > 0,
                failed: Boolean(failed),
              })
            )}
          </button>
        </div>
        <div className="ps-[52px]">
          {authorizationUrl && (
            <a href={authorizationUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => {
              if (!reusableConnectionUrl(pendingAuthorization)) {
                event.preventDefault();
                void connect(card.slug);
              }
            }} className="mt-1.5 inline-block text-note text-accent-text underline underline-offset-2">
              {t("connectors.openAuthorizationPage")}
            </a>
          )}
          {accounts.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {accounts.map((account) => {
                const active = /^active$/i.test(account.status);
                const reconnectable = needsReconnect(account) && account.id !== reconnect?.id;
                return (
                  <div key={account.id} className="flex min-w-0 items-center gap-2 text-note leading-5">
                    {active ? <Check size={12} className="shrink-0 text-success" /> : <span className="size-3 shrink-0" />}
                    <span className="min-w-0 truncate text-ink" title={`${account.alias ? `${account.id} · ` : ""}${account.status.toLowerCase()}`}>
                      {account.alias || account.id}
                      <span className="text-ink-secondary"> · {account.status.toLowerCase()}</span>
                    </span>
                    {reconnectable && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void connect(card.slug, account.alias, account)}
                        className="ms-auto shrink-0 rounded-full px-2 text-note font-medium leading-5 text-accent-text transition-colors hover:bg-raised-hover disabled:opacity-40"
                        aria-label={t("connectors.reconnectAria", { account: account.alias || account.id, service: card.label })}
                      >
                        {t("connectors.action.reconnect")}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(disconnectAccountConfirmation(card.label, account))) return;
                        disconnectAccount(card.slug, account.id);
                      }}
                      className={cn("shrink-0 rounded-full px-2 text-note font-medium leading-5 text-ink-secondary transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40", !reconnectable && "ms-auto")}
                      aria-label={t("connectors.disconnectAria", {
                        account: account.alias || account.id,
                        service: card.label,
                      })}
                    >
                      {t("connectors.disconnect")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {(serviceStatus?.connected || included) && (() => {
            const limited = botsWithLimitedServiceTools(state.bots, state.instances, card.slug);
            if (!limited.length) return null;
            const names = limited.slice(0, 4).map((candidate, index) => (
              <span key={candidate.id}>
                {index > 0 && ", "}
                <button
                  type="button"
                  onClick={() => { close(); openBotSettings(dispatch, "access", { botId: candidate.id, page: "apps" }); }}
                  className="font-medium text-ink underline underline-offset-2 hover:text-accent-text"
                >
                  {candidate.name}
                </button>
              </span>
            ));
            return (
              <div className="mt-1.5 text-note leading-relaxed text-ink-secondary">
                <span>{t("connectors.grants.limited", { count: limited.length })}</span>{" "}
                {names}
                {limited.length > 4 && <span>{t("connectors.grants.more", { count: limited.length - 4 })}</span>}
              </div>
            );
          })()}
          {addingAccount && (
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const alias = aliasDraft.trim();
                if (!alias) {
                  setError({ key: "connectors.aliasRequired" });
                  return;
                }
                void connect(card.slug, alias);
              }}
            >
              <input
                autoFocus
                value={aliasDraft}
                maxLength={64}
                onChange={(event) => setAliasDraft(event.target.value)}
                placeholder={t("connectors.aliasPlaceholder")}
                aria-label={accounts.length > 0
                  ? t("connectors.aliasAriaAnother", { service: card.label })
                  : t("connectors.aliasAriaNew", { service: card.label })}
                className="h-8 min-w-0 flex-1 rounded-full bg-inset px-3 text-ui text-ink placeholder:text-ink-secondary focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                disabled={busy || !aliasDraft.trim()}
                className="inline-flex h-7 shrink-0 items-center rounded-full bg-accent px-3 text-ui font-medium leading-5 text-accent-ink disabled:opacity-40"
              >
                {t("connectors.action.continue")}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }
}

function AppsSection({ id, title, note, viewAll, after, children }: {
  id: string;
  title: string;
  note?: string;
  viewAll?: { label: string; onClick: () => void };
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-apps-section={id}>
      <div className="mb-1.5 flex min-h-7 items-center justify-between gap-3 px-2">
        <h3 id={id} className="min-w-0 truncate text-body font-semibold leading-5 text-ink">
          {title}
          {note && <span className="ms-2 text-note font-normal text-ink-secondary">{note}</span>}
        </h3>
        {viewAll && (
          <button
            type="button"
            onClick={viewAll.onClick}
            className="shrink-0 rounded-full px-2 text-ui font-medium leading-5 text-ink-secondary transition-colors hover:text-ink"
          >
            {viewAll.label}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-1 @xl:grid-cols-2">{children}</div>
      {after}
    </section>
  );
}
