import { forwardRef, useImperativeHandle, useRef } from "react";
import type { MausAvatarHandle, MausAvatarProps } from "./Avatar";

const HUE: Record<string, number> = { green: 0, teal: 0, cyan: 20, blue: 60, purple: 110, pink: 155, red: 190, coral: 195, orange: 215, yellow: 235 };

export const MarkAvatar = forwardRef<MausAvatarHandle, MausAvatarProps>(function MarkAvatar(
  { color, size = 44, label = "Mark Bot", state = "idle", animated = true }, ref,
) {
  const root = useRef<HTMLSpanElement>(null);
  const animate = (frames: Keyframe[], duration: number) => {
    if (!animated || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    root.current?.animate(frames, { duration, easing: "ease-in-out" });
  };
  useImperativeHandle(ref, () => ({
    blink: () => animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], 180),
    spin: (duration = 500) => animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg)" }], duration),
    setExpression: (expression) => animate([{ transform: "scale(1)" }, { transform: `scale(${expression % 2 ? 1.08 : 0.94})` }, { transform: "scale(1)" }], 300),
  }));
  return <span ref={root} className="mark-mascot" role="img" aria-label={label} data-state={state} style={{ width: size, height: size }}>
    <img src="/mark-avatars/guide.png" alt="" draggable={false} style={{ filter: `hue-rotate(${HUE[color] ?? 0}deg)${color === "silver" || color === "chrome" ? " saturate(0)" : ""}` }} />
  </span>;
});
