export const MARK_AVATARS = [
  { id: "guide", name: "领航员", image: "/mark-avatars/guide.png" },
  { id: "coder", name: "代码搭档", image: "/mark-avatars/coder.png" },
  { id: "planner", name: "规划师", image: "/mark-avatars/planner.png" },
  { id: "researcher", name: "研究员", image: "/mark-avatars/researcher.png" },
  { id: "writer", name: "写作助手", image: "/mark-avatars/writer.png" },
  { id: "analyst", name: "数据分析师", image: "/mark-avatars/analyst.png" },
  { id: "operator", name: "运维专家", image: "/mark-avatars/operator.png" },
  { id: "designer", name: "创意设计师", image: "/mark-avatars/designer.png" },
  { id: "communicator", name: "沟通助手", image: "/mark-avatars/communicator.png" },
  { id: "reviewer", name: "质量审核员", image: "/mark-avatars/reviewer.png" },
] as const;

export const MARK_AVATAR_IDS = MARK_AVATARS.map((icon) => icon.id);

export type MarkAvatarId = (typeof MARK_AVATARS)[number]["id"];

export function isMarkAvatarId(value: unknown): value is MarkAvatarId {
  return typeof value === "string" && (MARK_AVATAR_IDS as readonly string[]).includes(value);
}

/** The bundled portrait URL for an id, or null for anything else (never a free-form path). */
export function markAvatarUrl(id: string): string | null {
  const icon = MARK_AVATARS.find((candidate) => candidate.id === id);
  return icon ? icon.image : null;
}

export async function markAvatarFile(image: string, id: string): Promise<File> {
  const response = await fetch(image);
  if (!response.ok) throw new Error(`头像素材加载失败 (${response.status})`);
  const blob = await response.blob();
  return new File([blob], `mark-${id}.png`, { type: "image/png" });
}
