import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import type { MausState } from "@/lib/mascot";
import type { Bot } from "@/state/store";
import { AvatarImageGenerator } from "../AvatarImageGenerator";
import { AvatarFraming, ModelAvatarIcons, OrganizationAvatarIcons, RESET_MASCOT_PATCH, useAvatarImage, type AvatarPatch } from "../avatar-editing";

export type AvatarEditorTab = "bot" | "generate" | "upload";

const TABS: ReadonlyArray<readonly [AvatarEditorTab, LocaleKey]> = [
  ["bot", "botPanel.avatar.tabBot"],
  ["generate", "botPanel.avatar.tabGenerate"],
  ["upload", "botPanel.avatar.tabUpload"],
];

export function AvatarEditorCard({ bot, onPatch, onClose }: {
  bot: Bot;
  activeState: MausState;
  onPatch: (patch: AvatarPatch) => void;
  onClose: () => void;
}) {
  const image = useAvatarImage(bot, onPatch);
  const { fileRef, crop, uploading, generating, setSavingConnection, busy, error, upload, removeImage, generate } = image;
  const showsImage = crop !== "mascot" && Boolean(bot.avatarUrl);
  const [tab, setTab] = useState<AvatarEditorTab>(showsImage ? "upload" : "bot");
  const tabsRef = useRef<HTMLDivElement>(null);
  // The card is a dialog: focus moves into it, onto the tab it opened on, so Escape and Tab work from the start.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label={t("botPanel.avatar.edit")}
      data-panel-avatar-editor
      onKeyDown={onKeyDown}
      className="popover-surface absolute inset-x-[-5px] top-[80px] z-30 overflow-hidden rounded-2xl border border-ink/[0.08] bg-menu text-left shadow-2xl shadow-black/50"
    >
      <div ref={tabsRef} className="flex items-center gap-0.5 border-b border-ink/[0.06] p-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-avatar-tab={id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-lg px-[11px] py-[5px] text-ui",
              tab === id ? "bg-ink/[0.08] font-medium text-ink" : "text-ink-secondary hover:text-ink",
            )}
          >
            {t(label)}
          </button>
        ))}
        <button
          type="button"
          data-avatar-reset
          disabled={busy}
          onClick={() => onPatch(RESET_MASCOT_PATCH)}
          className="ml-auto rounded-lg px-[11px] py-[5px] text-ui text-ink-secondary hover:text-ink disabled:opacity-50"
        >
          {t("botPanel.avatar.reset")}
        </button>
      </div>

      <div className="p-3">
        {tab === "bot" && (
          <>
            {/* The faces people actually pick: the Mark Bot portraits and the vendors' own
                model marks. The drawn mascot shapes are not offered here — the bot falls back
                to one on its own, but choosing an avatar means choosing a picture. */}
            <OrganizationAvatarIcons busy={busy} onUpload={upload} />
            <ModelAvatarIcons busy={busy} onUpload={upload} />
            {showsImage && (
              <>
                <AvatarFraming bot={bot} disabled={busy} onPatch={onPatch} />
                <p className="mt-2 text-note text-ink-secondary">当前是图片头像。上方可随时换图标；「上传」页可调整裁剪。</p>
              </>
            )}
          </>
        )}

        {tab === "generate" && (
          <div className="[&>div:first-child]:mt-0 [&>div:first-child]:border-0 [&>div:first-child]:pt-0">
            <AvatarImageGenerator
              botLabel={bot.title || bot.name}
              disabled={uploading}
              generating={generating}
              onGenerate={generate}
              onSavingChange={setSavingConnection}
            />
          </div>
        )}

        {tab === "upload" && (
          <>
            <OrganizationAvatarIcons busy={busy} onUpload={upload} />
            {showsImage && <AvatarFraming bot={bot} disabled={busy} onPatch={onPatch} />}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              onChange={(event) => void upload(event.target.files?.[0])}
            />
            <button
              type="button"
              data-avatar-drop
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void upload(event.dataTransfer.files?.[0]);
              }}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-ink/15 px-3 py-6 text-center text-ui text-ink-secondary hover:border-ink/25 hover:text-ink disabled:opacity-50"
            >
              {uploading ? <Loader2 size={22} className="animate-spin" /> : <ImagePlus size={22} />}
              <span>{t("botPanel.avatar.drop")}</span>
              <span className="text-note text-ink-tertiary">{t("botPanel.avatar.types")}</span>
            </button>
            <div className="mt-2.5 flex justify-end">
              {bot.avatarUrl && (
                <button
                  type="button"
                  onClick={removeImage}
                  disabled={busy}
                  aria-label={t("botIdentity.removeAvatar")}
                  title={t("botPanel.avatar.remove")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary hover:bg-control hover:text-danger disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {!showsImage && <p className="mt-2 text-note text-ink-tertiary">{t("botPanel.avatar.uploadHint")}</p>}
          </>
        )}

        {error && <div role="alert" className="mt-3 text-note text-danger">{error}</div>}
      </div>
    </div>
  );
}
