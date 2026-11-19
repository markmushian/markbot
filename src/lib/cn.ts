import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The app's type scale lives in `--text-*` tokens (text-ui, text-note, text-title …),
 * see `src/styles.css`. tailwind-merge classifies a bare `text-<word>` as a *colour*
 * unless it knows the word is a size, so it treated `text-ui` as a colour, saw
 * `text-ink` later in the same `cn(...)` call and dropped the size as the losing
 * colour. Nearly every line pairs a size with a colour, so that silently erased font
 * sizes across the whole app.
 *
 * Registering the scale as the `font-size` group makes size and colour independent
 * again: `cn("text-ui text-ink")` keeps both.
 */
const TYPE_SCALE = [
  "micro", "tiny", "meta", "note", "ui", "body", "lead", "title", "page", "subtitle",
  "h1", "h2", "h3", "display", "hero",
  // The long tail, named by the pixel.
  "8", "16", "19", "21", "26", "48",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: TYPE_SCALE }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
