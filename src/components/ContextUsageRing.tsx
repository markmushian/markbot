import { cn } from "@/lib/cn";
import { usageLabel } from "../../shared/runtime-codes.ts";

/** A context-window ring. The important rule: unknown is drawn as an empty
 * dashed circle with a question mark, never as a full green 0% ring. */
export function ContextUsageRing({ used, window, size = 22, className }: {
  used?: number | null;
  window?: number | null;
  size?: number;
  className?: string;
}) {
  const known = typeof used === "number" && Number.isFinite(used)
    && typeof window === "number" && Number.isFinite(window) && window > 0;
  const ratio = known ? Math.max(0, Math.min(1, used! / window!)) : 0;
  const percent = known ? Math.round(ratio * 100) : null;
  const label = usageLabel(percent);
  const radius = (size - 3) / 2;
  const circumference = 2 * Math.PI * radius;
  const tone = !known ? "text-ink-tertiary" : percent !== null && percent >= 85 ? "text-danger" : percent !== null && percent >= 65 ? "text-warning" : "text-success";
  const compact = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);

  return (
    <span data-context-usage-ring data-known={known ? "true" : "false"}
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      title={known
        ? `上下文已用 ${compact(used!)} / ${compact(window!)} tokens（${label.text}）`
        : "上下文用量未知（不是 0）。这个引擎没有上报 token 数。"}
      aria-label={known ? `上下文用量 ${label.text}` : "上下文用量未知"}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={cn("shrink-0", tone)}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={2.5} strokeDasharray={known ? undefined : "2 2"} />
        {known && (
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={2.5}
            strokeLinecap="round" strokeDasharray={`${circumference * ratio} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
        {!known && <text x={size / 2} y={size / 2 + 3.5} textAnchor="middle" fontSize={size * 0.5} fill="currentColor">?</text>}
      </svg>
      <span className="whitespace-nowrap text-meta tabular-nums text-ink-tertiary">
        {known ? `${compact(used!)}/${compact(window!)}` : "用量未知"}
      </span>
    </span>
  );
}
