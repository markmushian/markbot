// Official Hermes Agent (Nous Research) desktop app icon. The same artwork is
// inlined in engine-brand-icons.ts; this component just wraps that one source
// of truth so driver marks and name-matched brand marks stay identical.
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
