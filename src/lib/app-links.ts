export const APP_NAME = "Mark Bot";

/** The product's own website: downloads, pricing, help. Everything a person reads rather than fetches from Git. */
export const WEBSITE_URL = "https://markbot.app";

/** The source repository. Docs, releases and the licence live here, so these links are Git paths, not site paths.
 * Change this one line when the repository moves; nothing else needs to know the owner. */
export const GITHUB_REPOSITORY = "https://github.com/markmushian/markbot";

/** Kept for callers that mean "the project", which is the repository for every link below. */
export const APP_REPOSITORY = GITHUB_REPOSITORY;

export const DOCS_URL = `${GITHUB_REPOSITORY}/tree/main/docs`;
/** The help centre is the docs: one set of pages, linked from the app and the website alike. */
export const HELP_CENTER_URL = DOCS_URL;
export const APPROVAL_LEVELS_URL = `${GITHUB_REPOSITORY}/blob/main/docs/approval-levels.md`;
export const PASSKEY_HELP_URL = `${WEBSITE_URL}/help/passkeys`;
export const FEEDBACK_URL = `${WEBSITE_URL}/help`;
export const RELEASES_URL = `${GITHUB_REPOSITORY}/releases`;
export const PRICING_URL = WEBSITE_URL;
export function withSource(url: string, source: string): string {
  const target = new URL(url);
  target.searchParams.set("src", source);
  return target.href;
}
export const LICENSE_URL = `${GITHUB_REPOSITORY}/blob/main/LICENSE`;

/** Empty until Mark Bot has listings of its own: the phone dialog shows only the stores that answer here. Pointing
 * these at another product's App Store page or APK would send people to the wrong app. */
export const IOS_APP_STORE_URL = "";
export const ANDROID_APK_URL = "";

/** True once the platform has a download of its own to offer. */
export const hasPhoneApp = (url: string): boolean => url.trim().length > 0;

export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

export function platformLabel(platform?: string): string | null {
  return (platform && PLATFORM_NAMES[platform]) ?? null;
}

export async function openExternalLink(url: string): Promise<void> {
  if (window.ogb?.openExternal) {
    await window.ogb.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
