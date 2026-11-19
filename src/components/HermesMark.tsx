// Official Hermes Agent desktop app ico supplied by the user
// (assets/official-brand/user-provided/). The same artwork is inlined in
// engine-brand-icons.ts as OFFICIAL_HERMES_MARK, so driver marks, name-matched
// brand marks and this component all stay identical.
import { cn } from "@/lib/cn";
import { OFFICIAL_HERMES_MARK } from "./engine-brand-icons";

interface IconProps {
  size?: number;
  className?: string;
}

export function HermesMark({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("text-ink", className)}
      aria-hidden
    >
      <image href={OFFICIAL_HERMES_MARK} width="64" height="64" />
    </svg>
  );
}
