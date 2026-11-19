import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { api } from "@/state/store";
import { t } from "@/lib/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * The notes a room keeps for itself. Everyone who speaks in the room reads them; nothing here reaches a member's private
 * chats. Written by hand, because the group's shared facts are the ones a person is sure about.
 */
export function GroupMemoryDialog({ groupId, groupName, onClose }: {
  groupId: string;
  groupName: string;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void api<{ text: string }>(`/api/groups/${encodeURIComponent(groupId)}/memory`)
      .then((result) => { if (alive) setText(result.text); })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { alive = false; };
  }, [groupId]);

  const save = async () => {
    if (text === null) return;
    setSaving(true);
    setError("");
    try {
      await api(`/api/groups/${encodeURIComponent(groupId)}/memory`, { method: "PUT", body: JSON.stringify({ text }) });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      open
      title={t("groupMemory.title", { name: groupName })}
      cancelLabel={t("common.cancel")}
      confirmLabel={t("common.save")}
      onCancel={onClose}
      onConfirm={() => void save()}
      pending={saving}
      body={
        <div className="flex flex-col gap-2">
          <p className="text-note leading-relaxed text-ink-secondary">{t("groupMemory.hint")}</p>
          {text === null && !error && (
            <p role="status" className="flex items-center gap-2 py-6 text-ui text-ink-secondary">
              <Loader2 size={14} className="animate-spin" />{t("groupMemory.loading")}
            </p>
          )}
          {text !== null && (
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
              autoFocus
              placeholder={t("groupMemory.placeholder")}
              className="w-full resize-y rounded-lg border border-hairline/50 bg-app px-3 py-2 font-mono text-note leading-relaxed text-ink outline-none placeholder:text-ink-secondary focus-visible:border-accent"
            />
          )}
          {error && <p role="alert" className="text-note text-danger">{error}</p>}
        </div>
      }
    />
  );
}
