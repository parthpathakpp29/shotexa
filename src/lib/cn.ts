import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know Shotexa's custom theme tokens, otherwise e.g. `text-ink-2`
 * (a colour) could be mistaken for a font size and wrongly override `text-sm`.
 */
const twMerge = extendTailwindMerge<"type-scale">({
  extend: {
    theme: {
      color: ["page", "surface", "surface-2", "surface-3", "ink", "ink-2", "ink-3", "line", "line-strong", "accent", "accent-hover", "accent-soft", "accent-line", "accent-ink", "dark", "dark-2", "success", "success-soft", "warning", "warning-soft", "error", "error-soft"],
      radius: ["xs", "sm", "md", "lg", "xl"],
      shadow: ["xs", "sm", "md", "accent"],
      font: ["display", "sans", "mono"],
    },
    classGroups: {
      "type-scale": [{ t: ["display", "h1", "h2", "h3", "body", "body-sm", "label", "micro", "mono"] }],
    },
  },
});

/** Merge class names; later Tailwind utilities win (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
