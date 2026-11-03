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

export async function markAvatarFile(image: string, id: string): Promise<File> {
  const response = await fetch(image);
  if (!response.ok) throw new Error(`头像素材加载失败 (${response.status})`);
  const blob = await response.blob();
  return new File([blob], `mark-${id}.png`, { type: "image/png" });
}
