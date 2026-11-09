import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

import { useStore, type Bot } from "@/state/store";
import { imageAttachmentFromFile } from "@/lib/composer-attachments";
import { useOrganizationBranding } from "@/lib/use-organization-branding";
import { t } from "@/lib/i18n";
import {
  AVATAR_FOCUS_CENTER,
  AVATAR_ZOOM_MAX,
  AVATAR_ZOOM_MIN,
  botAvatarUrlFromStoredPath,
  clampAvatarFocus,
  clampAvatarZoom,
  type BotAvatarCrop,
} from "../../shared/bot-avatar";
import { BotAvatar } from "./Avatar";
import { useBotEditor } from "./bot-settings/BotEditorContext";
import { MARK_AVATARS, markAvatarFile } from "@/lib/mark-avatars";
import { MODEL_AVATARS } from "@/lib/model-avatars";

export type AvatarPatch = Partial<
  Pick<Bot, "avatarCrop" | "avatarUrl" | "avatarZoom" | "avatarHue" | "avatarFocusX" | "avatarFocusY" | "color" | "mascotExpression" | "mascotBody" | "mascotFaceColor">
>;

export const RESET_MASCOT_PATCH: AvatarPatch = { avatarCrop: "mascot", color: "green", mascotExpression: null, mascotBody: "cursor", mascotFaceColor: null };

export const CROP_LABEL = {
  mascot: "机器人",
  circle: "圆形",
  rounded: "圆角",
  square: "方形",
} satisfies Record<BotAvatarCrop, string>;

const FRAME_SIZE = 168;

export function AvatarFraming({
  bot,
  disabled,
  onPatch,
}: {
  bot: Bot;
  disabled: boolean;
  onPatch: (patch: AvatarPatch) => void;
}) {
  const zoom = clampAvatarZoom(bot.avatarZoom ?? AVATAR_ZOOM_MIN);
  const focusX = clampAvatarFocus(bot.avatarFocusX ?? AVATAR_FOCUS_CENTER);
  const focusY = clampAvatarFocus(bot.avatarFocusY ?? AVATAR_FOCUS_CENTER);
  const framed = zoom !== AVATAR_ZOOM_MIN || focusX !== AVATAR_FOCUS_CENTER || focusY !== AVATAR_FOCUS_CENTER;
  const drag = useRef<{ x: number; y: number; focusX: number; focusY: number; pointer: number } | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, focusX, focusY, pointer: event.pointerId };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointer) return;
    onPatch({
      avatarFocusX: clampAvatarFocus(start.focusX - (event.clientX - start.x) / FRAME_SIZE / zoom),
      avatarFocusY: clampAvatarFocus(start.focusY - (event.clientY - start.y) / FRAME_SIZE / zoom),
    });
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer === event.pointerId) drag.current = null;
  };
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (disabled || event.deltaY === 0) return;
    event.preventDefault();
    onPatch({ avatarZoom: clampAvatarZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08)) });
  };

  return (
    <div className="py-3">
      <div
        className="mx-auto w-fit cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        <BotAvatar bot={bot} size={FRAME_SIZE} animated={false} label={t("avatarEditor.preview", { name: bot.name })} previewUrl={bot.id.startsWith("draft-") ? bot.avatarUrl ?? undefined : undefined} />
      </div>
      <div className="mb-1.5 mt-4 flex items-baseline justify-between">
        <span className="text-note font-mediumtext-ink-secondary">{t("avatarEditor.zoom")}</span>
        <span className="tabular-nums text-note text-ink-secondary">{Math.round(zoom * 100)}%</span>
      </div>
      <input
        type="range"
        min={AVATAR_ZOOM_MIN}
        max={AVATAR_ZOOM_MAX}
        step={0.01}
        value={zoom}
        disabled={disabled}
        aria-label={t("avatarEditor.zoomAria")}
        aria-valuemin={AVATAR_ZOOM_MIN}
        aria-valuemax={AVATAR_ZOOM_MAX}
        aria-valuenow={zoom}
        aria-valuetext={`${Math.round(zoom * 100)}%`}
        onChange={(event) => onPatch({ avatarZoom: clampAvatarZoom(Number(event.target.value)) })}
        className="w-full accent-accent"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3 text-note text-ink-secondary">
        <span>{t("avatarEditor.hint")}</span>
        {framed && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPatch({ avatarZoom: AVATAR_ZOOM_MIN, avatarFocusX: AVATAR_FOCUS_CENTER, avatarFocusY: AVATAR_FOCUS_CENTER })}
            className="shrink-0 rounded-md px-2 py-1 text-ink hover:bg-control disabled:opacity-50"
          >
            {t("avatarEditor.reset")}
          </button>
        )}
      </div>
      <div className="mb-1.5 mt-4 flex items-center justify-between text-note text-ink-secondary"><span>图片配色</span><span>{Math.round(bot.avatarHue ?? 0)}°</span></div>
      <input type="range" min="0" max="360" step="5" value={bot.avatarHue ?? 0} disabled={disabled} aria-label="图片配色" onChange={(event) => onPatch({ avatarHue: Number(event.target.value) })} className="w-full accent-accent" />
      <button type="button" disabled={disabled || !bot.avatarHue} onClick={() => onPatch({ avatarHue: 0 })} className="mt-1 rounded-md px-2 py-1 text-note text-ink-secondary hover:bg-control disabled:opacity-40">恢复原色</button>
    </div>
  );
}

export function OrganizationAvatarIcons({ busy, onUpload }: { busy: boolean; onUpload: (file: File) => Promise<boolean> }) {
  const organization = useOrganizationBranding();
  const [presetError, setPresetError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const choose = async (image: string, id: string) => {
    if (busy || loading) return;
    setLoading(id);
    setPresetError(null);
    try { if (await onUpload(await markAvatarFile(image, id)) !== false) setSelected(id); }
    catch (error) { setPresetError(error instanceof Error ? error.message : String(error)); }
    finally { setLoading(null); }
  };
  return (
    <div className="mb-3 border-b border-hairline/40 pb-3">
      <div className="mb-2 text-ui font-medium text-ink-secondary">{t("avatarEditor.presets")}</div>
      <div className="mb-3 grid grid-cols-5 gap-2">{MARK_AVATARS.map(icon => <button key={icon.id} type="button" disabled={busy || loading !== null} aria-pressed={selected === icon.id} aria-label={t("avatarEditor.usePreset", { name: icon.name })} title={icon.name} className="mark-avatar-preset flex min-w-0 flex-col items-center gap-1 disabled:opacity-50 aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent/30" onClick={() => void choose(icon.image, icon.id)}><img src={icon.image} alt="" className="size-14 object-contain" /><span className="w-full truncate text-center text-meta">{icon.name}</span></button>)}</div>
      {loading && <p role="status" className="mb-2 text-note text-ink-secondary">{t("avatarEditor.usePreset", { name: MARK_AVATARS.find(icon => icon.id === loading)?.name ?? "" })}…</p>}
      {presetError && <p role="alert" className="text-note text-danger">{presetError}</p>}
      {organization?.icons.length ? <div className="mb-2 text-ui font-medium text-ink-secondary">{t("avatarEditor.icons", { name: organization.name })}</div> : null}
      <div className="flex flex-wrap gap-2">{organization?.icons.map(icon => <button key={icon.id} type="button" disabled={busy} title={icon.name} aria-label={t("avatarEditor.usePreset", { name: icon.name })} className="flex size-12 items-center justify-center rounded-lg border border-hairline/40 hover:bg-control disabled:opacity-50" onClick={() => {
        const bytes = Uint8Array.from(atob(icon.image.slice(22)), byte => byte.charCodeAt(0));
        void onUpload(new File([bytes], `${icon.id}.png`, { type: "image/png" }));
      }}><img src={icon.image} alt="" className="size-10 rounded-md object-contain" /></button>)}</div>
    </div>
  );
}

/** Vendor marks, offered where the upload button is: the same shape of a preset as the drawings above. */
export function ModelAvatarIcons({ busy, onUpload }: { busy: boolean; onUpload: (file: File) => Promise<boolean> }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const choose = async (image: string, id: string) => {
    if (busy || loading) return;
    setLoading(id);
    setError(null);
    try { if (await onUpload(await markAvatarFile(image, id)) !== false) setSelected(id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(null); }
  };
  return (
    <div className="mt-3 border-t border-hairline/40 pt-3">
      <div className="mb-2 flex items-center justify-between text-ui font-medium text-ink-secondary">
        <span>模型图标</span>
        {loading && <span role="status" className="text-note font-normal">正在使用…</span>}
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {MODEL_AVATARS.map((icon) => (
          <button
            key={icon.id}
            type="button"
            disabled={busy || loading !== null}
            aria-pressed={selected === icon.id}
            aria-label={`用 ${icon.name} 图标作为头像`}
            title={icon.name}
            onClick={() => void choose(icon.image, icon.id)}
            className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-hairline/40 bg-control/40 hover:bg-control disabled:opacity-50 aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent/30"
          >
            <img src={icon.image} alt="" className="size-7 object-contain" />
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-1.5 text-note text-danger">{error}</p>}
    </div>
  );
}

export function useAvatarImage(bot: Bot, onPatch: (patch: AvatarPatch) => void) {
  const { flushBotPatches } = useStore();
  const { request: api, uploadAvatar } = useBotEditor();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [savingConnection, setSavingConnection] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crop = bot.avatarCrop ?? "mascot";
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const busy = uploading || generating || savingConnection;

  const upload = async (file: File | undefined) => {
    if (!file || busy) return false;
    setUploading(true);
    setError(null);
    try {
      const saved = uploadAvatar ? null : await imageAttachmentFromFile(file);
      const avatarUrl = uploadAvatar ? await uploadAvatar(file) : saved ? botAvatarUrlFromStoredPath(saved.path) : null;
      if (!avatarUrl) throw new Error("上传的图片无法用作头像");
      const latestCrop = cropRef.current;
      onPatch({
        avatarUrl,
        avatarCrop: latestCrop === "mascot" ? "circle" : latestCrop,
        avatarHue: 0,
        mascotExpression: null,
        avatarZoom: AVATAR_ZOOM_MIN,
        avatarFocusX: AVATAR_FOCUS_CENTER,
        avatarFocusY: AVATAR_FOCUS_CENTER,
      });
      return true;
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
      return false;
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeImage = () => {
    setError(null);
    onPatch({
      avatarUrl: null,
      avatarCrop: "mascot",
      avatarHue: 0,
      avatarZoom: AVATAR_ZOOM_MIN,
      avatarFocusX: AVATAR_FOCUS_CENTER,
      avatarFocusY: AVATAR_FOCUS_CENTER,
    });
  };

  const generate = async (direction: string) => {
    if (busy) return;
    setGenerating(true);
    setError(null);
    try {
      // Commit debounced profile edits first, then feed the generated avatar back through the same serialized mutation
      // lane as upload and remove.
      const cropAtStart = cropRef.current;
      await flushBotPatches(bot.id);
      const result: { avatarUrl: string; bot: Bot } = await api(`/api/bots/${bot.id}/avatar/generate`, {
        method: "POST",
        body: JSON.stringify({ prompt: direction.trim() }),
      });
      const latestCrop = cropRef.current;
      onPatch({
        avatarUrl: result.avatarUrl,
        avatarHue: 0,
        mascotExpression: null,
        avatarCrop:
          latestCrop === cropAtStart
            ? (result.bot.avatarCrop ?? "circle")
            : latestCrop,
      });
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : String(generateError));
    } finally {
      setGenerating(false);
    }
  };

  return { fileRef, crop, uploading, generating, setSavingConnection, busy, error, upload, removeImage, generate };
}
