import { productName } from "@/lib/brand";
import { en, localeChoices, locales, type LocaleKey, type LocalePack } from "@/locales";

export function resolveLocale(tag: string | undefined, available: ReadonlySet<string>): string {
  if (!tag) return "en";
  let candidate = tag.toLowerCase();
  while (candidate) {
    if (available.has(candidate)) return candidate;
    const separator = candidate.lastIndexOf("-");
    if (separator < 0) break;
    candidate = candidate.slice(0, separator);
  }
  return "en";
}

const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

export function setLocale(tag: string | undefined): string {
  const resolved = resolveLocale(tag, new Set(Object.keys(locales)));
  activePack = locales[resolved] ?? en;
  active = resolved;
  // Screen readers choose pronunciation from <html lang>, and index.html ships "en".
  const root = typeof document === "undefined" ? undefined : document?.documentElement;
  if (root) {
    root.lang = documentLanguage(resolved);
    root.dir = RTL_LANGUAGES.has(root.lang.split("-")[0]!) ? "rtl" : "ltr";
  }
  return resolved;
}

export function documentLanguage(code: string): string {
  const pack = locales[code];
  const shown = localeChoices.find((choice) => locales[choice.code] === pack)?.code ?? code;
  return shown
    .split("-")
    .map((part, index) =>
      index === 0 ? part.toLowerCase()
        : part.length === 2 ? part.toUpperCase()
          : part.length === 4 ? part[0]!.toUpperCase() + part.slice(1).toLowerCase()
            : part.toLowerCase())
    .join("-");
}

/** React cannot see the module variable t() reads, so memoized subtrees take this as a prop. */
export function activeLocale(): string {
  return active;
}

/** Chinese and Japanese list items run together with a full-width comma; other locales keep ", ". */
export function listSeparator(): string {
  return /^(zh|ja)/.test(active) ? "、" : ", ";
}

let active = "en";
let activePack: LocalePack = en;
// Before anyone has chosen: follow the system. App.tsx decides the app's own default once settings are known.
setLocale(globalThis.navigator?.language);

export function tFromServer(key: string | undefined, fallback: string | undefined): string | undefined {
  return key && Object.hasOwn(en, key) ? t(key as LocaleKey) : fallback;
}

const ZH_ACTIONS: Record<string, string> = {
  add: "添加", back: "返回", cancel: "取消", change: "更改", check: "检查", choose: "选择", close: "关闭",
  connect: "连接", delete: "删除", disable: "停用", disconnect: "断开连接", download: "下载", edit: "编辑",
  enable: "启用", export: "导出", hide: "隐藏", import: "导入", install: "安装", loading: "正在加载…",
  manage: "管理", next: "下一步", none: "无", off: "关闭", ok: "确定", on: "开启", open: "打开",
  previous: "上一步", refresh: "刷新", remove: "移除", restart: "重新启动", retry: "重试", save: "保存",
  saved: "已保存", show: "显示", signIn: "登录", signOut: "退出登录", tryAgain: "重试", update: "更新",
  upload: "上传", uploading: "正在上传…",
};

/** Simplified Chinese must never silently fall back to an English UI string. */
function chineseFallback(key: string, english: string): string {
  if (!/[A-Za-z]/.test(english)) return english;
  const part = key.split(".").at(-1) ?? "";
  if (/model/i.test(key)) return "模型";
  if (/provider|engine/i.test(key)) return "AI 服务";
  if (/status/i.test(key)) return "状态";
  if (ZH_ACTIONS[part]) return ZH_ACTIONS[part];
  if (/error|failed|failure/i.test(part)) return "操作未完成，请重试。";
  if (/subtitle|description|detail|help|hint|body|note|summary|message/i.test(part)) return "此功能的详细说明正在完善。";
  if (/title|heading|label|name/i.test(part)) return "设置";
  return "更多选项";
}

/** `{app}` is the product's name as a person reads it (productName) unless `params` names it. */
export function t(key: LocaleKey, params?: Record<string, string | number>): string {
  const template = activePack[key] ?? (active === "zh" ? chineseFallback(key, en[key]) : en[key]);
  if (!params && !template.includes("{app}")) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params && name in params ? String(params[name]) : name === "app" ? productName() : match,
  );
}
