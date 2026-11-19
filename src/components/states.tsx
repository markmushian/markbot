import type { ReactNode } from "react";
import { AlertTriangle, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** The three states every panel passes through. They share one shape so an empty
 * screen, a failure and a wait read as the same product talking, not three
 * different components that happened to be written on the same day.
 *
 * The rules these encode, from the design brief:
 *   * An empty screen is an invitation to act, not a mood. One short imperative
 *     title and one action, not a sentence about how empty it is.
 *   * A failure says what happened and how to fix it. It never apologizes and
 *     it is never vague; "出错了" with no next step is not a message.
 *   * A wait is quiet. A spinner that never stops is worse than a one-line label.
 *
 * Sizes and colours come from the type scale and the surface ramp, so a state
 * block looks the same on every skin.
 */
const SHELL = "flex min-w-0 flex-col items-center justify-center gap-2 px-6 py-10 text-center";

export function EmptyState({ icon: Icon, title, hint, action, className, ...rest }: {
  icon?: LucideIcon;
  /** A short imperative: "添加一个助手", not "这里还没有助手". */
  title: string;
  /** Optional second line. Say what the thing is for, not that it is missing. */
  hint?: ReactNode;
  /** The one thing to do next. An empty screen with no action is a dead end. */
  action?: ReactNode;
  className?: string;
} & Record<`data-${string}`, unknown>) {
  return (
    <div {...rest} className={cn(SHELL, className)}>
      {Icon && <Icon size={20} aria-hidden="true" className="text-ink-tertiary" />}
      <p className="text-ui font-medium text-ink">{title}</p>
      {hint && <p className="max-w-[36rem] text-note leading-4 text-ink-secondary">{hint}</p>}
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, hint, onRetry, retryLabel = "重试", raw, className, ...rest }: {
  /** What happened, in the person's words: "没能连上 GitHub". */
  title: string;
  /** How to fix it. This is the part that makes the block worth showing. */
  hint?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** The underlying message, kept for a bug report but never the headline. */
  raw?: string;
  className?: string;
} & Record<`data-${string}`, unknown>) {
  return (
    <div {...rest} role="alert" className={cn(SHELL, className)}>
      <AlertTriangle size={20} aria-hidden="true" className="text-warning" />
      <p className="text-ui font-medium text-ink">{title}</p>
      {hint && <p className="max-w-[36rem] text-note leading-4 text-ink-secondary">{hint}</p>}
      {(onRetry || raw) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button type="button" onClick={onRetry} className="h-9 rounded-control bg-control px-3 text-ui font-medium text-ink hover:bg-raised-hover">
              {retryLabel}
            </button>
          )}
          {raw && <code className="max-w-[36rem] truncate text-micro text-ink-tertiary">{raw}</code>}
        </div>
      )}
    </div>
  );
}

export function LoadingState({ label = "加载中", className, ...rest }: {
  label?: string;
  className?: string;
} & Record<`data-${string}`, unknown>) {
  return (
    <div {...rest} role="status" className={cn(SHELL, "py-8", className)}>
      <Loader2 size={15} aria-hidden="true" className="animate-spin text-ink-tertiary" />
      <p className="text-note text-ink-secondary">{label}</p>
    </div>
  );
}
