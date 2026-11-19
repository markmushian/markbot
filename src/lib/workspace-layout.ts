/** Project-level panel layout. Every project keeps its own order, visibility,
 * collapsed state and width, so arranging the cockpit once is not undone by
 * switching projects or restarting. Unknown ids are ignored, new ids get a
 * default: an old saved layout never breaks a newer build.
 */

export interface PanelState {
  id: string;
  order: number;
  visible: boolean;
  collapsed: boolean;
  /** Fraction of the row: 1 = full width, 0.5 = half. */
  width: 0.5 | 1;
}

export type WorkspaceLayout = Record<string, PanelState>;

const KEY_PREFIX = "markbot.workspace.layout.";

export function layoutKey(projectKey: string): string {
  return `${KEY_PREFIX}${projectKey}`;
}

export function defaultLayout(ids: readonly string[]): WorkspaceLayout {
  return Object.fromEntries(ids.map((id, index) => [id, { id, order: index, visible: true, collapsed: false, width: id === "stats" || id === "devices" ? 0.5 : 1 }]));
}

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function readLayout(projectKey: string, ids: readonly string[], store = storage()): WorkspaceLayout {
  const fresh = defaultLayout(ids);
  if (!store) return fresh;
  try {
    const raw = store.getItem(layoutKey(projectKey));
    if (!raw) return fresh;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fresh;
    const saved = parsed as Record<string, unknown>;
    const next: WorkspaceLayout = {};
    for (const [id, fallback] of Object.entries(fresh)) {
      const entry = saved[id];
      if (!entry || typeof entry !== "object") { next[id] = fallback; continue; }
      const value = entry as Record<string, unknown>;
      next[id] = {
        id,
        order: typeof value.order === "number" && Number.isFinite(value.order) ? value.order : fallback.order,
        visible: typeof value.visible === "boolean" ? value.visible : fallback.visible,
        collapsed: typeof value.collapsed === "boolean" ? value.collapsed : fallback.collapsed,
        width: value.width === 0.5 ? 0.5 : 1,
      };
    }
    // Re-number so a hand-edited file cannot produce duplicate orders.
    return ordered(next);
  } catch {
    return fresh;
  }
}

export function writeLayout(projectKey: string, layout: WorkspaceLayout, store = storage()): void {
  try { store?.setItem(layoutKey(projectKey), JSON.stringify(layout)); } catch { /* private mode */ }
}

export function resetLayout(projectKey: string, ids: readonly string[], store = storage()): WorkspaceLayout {
  const fresh = defaultLayout(ids);
  writeLayout(projectKey, fresh, store);
  return fresh;
}

/** Compact orders to 0..n-1 in the current visual order. */
export function ordered(layout: WorkspaceLayout): WorkspaceLayout {
  const rows = Object.values(layout).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  return Object.fromEntries(rows.map((row, index) => [row.id, { ...row, order: index }]));
}

export function panelOrder(layout: WorkspaceLayout): string[] {
  return Object.values(layout).filter((row) => row.visible).sort((a, b) => a.order - b.order).map((row) => row.id);
}

export function movePanel(layout: WorkspaceLayout, id: string, targetId: string): WorkspaceLayout {
  const ids = panelOrder(layout).filter((entry) => entry !== id);
  const at = ids.indexOf(targetId);
  if (at < 0 || !layout[id]) return layout;
  ids.splice(at, 0, id);
  const next: WorkspaceLayout = { ...layout };
  for (const [index, key] of ids.entries()) next[key] = { ...next[key]!, order: index };
  for (const key of Object.keys(next)) {
    if (!ids.includes(key) && next[key]?.visible) next[key] = { ...next[key]!, order: ids.length + next[key]!.order / 1000 };
  }
  return ordered(next);
}

export function togglePanel(layout: WorkspaceLayout, id: string, field: "visible" | "collapsed"): WorkspaceLayout {
  const row = layout[id];
  if (!row) return layout;
  return { ...layout, [id]: { ...row, [field]: !row[field] } };
}

export function setPanelWidth(layout: WorkspaceLayout, id: string, width: 0.5 | 1): WorkspaceLayout {
  const row = layout[id];
  if (!row) return layout;
  return { ...layout, [id]: { ...row, width } };
}
