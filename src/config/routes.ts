/**
 * Route metadata helpers: canonical URLs, indexability and the sitemap list.
 * One genuinely different intent = one indexable page (architecture §10). Unfinished tool
 * routes exist for workspace continuity but stay noindex and out of the sitemap.
 */
import type { Metadata } from "next";
import { isIndexable, SOCIAL_IMAGE } from "./site";
import { TOOL_LIST, TOOLS, toolByRoute, type ToolId } from "./tools";

export interface StaticRoute {
  path: `/${string}`;
  title: string;
  description: string;
  indexable: boolean;
}

export const STATIC_ROUTES: StaticRoute[] = [
  { path: "/", title: "Shotexa – Free Private Screenshot Tools Online", description: "Stitch screenshots, hide sensitive information, extract text and create PDFs directly in your browser. Files stay on your device.", indexable: true },
  { path: "/tools", title: "All Screenshot Tools | Shotexa", description: "Every Shotexa screenshot tool — stitch, redact, extract text, PDF and more, all processed locally in your browser.", indexable: true },
  { path: "/privacy", title: "How Shotexa Keeps Screenshots Local | Shotexa", description: "Learn how Shotexa processes screenshots in your browser, keeps files in the current workspace and clears them when the tab closes or reloads.", indexable: true },
  { path: "/alternatives", title: "Shotexa Alternatives & Comparisons | Shotexa", description: "Compare Shotexa to popular screenshot tools like Xnapper, CleanShot X, and Snagit to find the best fit for your workflow.", indexable: true },
  { path: "/alternatives/xnapper", title: "Best Free Xnapper Alternative for Windows & Web | Shotexa", description: "Looking for an Xnapper alternative? Shotexa is a free, browser-based screenshot beautifier and editor that works on any operating system.", indexable: true },
  { path: "/alternatives/cleanshot-x", title: "CleanShot X Alternative for Windows & Cross-Platform | Shotexa", description: "Compare CleanShot X with Shotexa. Free online screenshot editor, beautifier and redaction tool that works everywhere, including Windows and Linux.", indexable: true },
  { path: "/alternatives/snagit", title: "Free Snagit Alternative Online | Shotexa", description: "Need a Snagit alternative for screenshot OCR and editing? Shotexa is a free browser-based tool for capturing text, redacting info, and stitching screenshots.", indexable: true },
  { path: "/alternatives/pika", title: "Free Pika.style Alternative for Screenshot Mockups | Shotexa", description: "Compare Pika with Shotexa. Create beautiful screenshot mockups and backgrounds in your browser for free, without watermarks.", indexable: true },
  { path: "/alternatives/shots-so", title: "Free Shots.so Alternative for Screenshot Editing | Shotexa", description: "A free alternative to Shots.so for creating beautiful screenshots, comparing images, and editing UI mockups privately in your browser.", indexable: true },
];

/** Paths that belong in sitemap.xml: indexable static pages + live tools only. */
export function sitemapPaths(): string[] {
  return [...STATIC_ROUTES.filter((r) => r.indexable).map((r) => r.path), ...TOOL_LIST.filter((t) => t.status === "live").map((t) => t.route)];
}

const robotsFor = (indexable: boolean): Metadata["robots"] => (indexable && isIndexable() ? { index: true, follow: true } : { index: false, follow: true });

export function staticMetadata(path: StaticRoute["path"]): Metadata {
  const r = STATIC_ROUTES.find((x) => x.path === path)!;
  return {
    title: r.title,
    description: r.description,
    alternates: { canonical: path },
    openGraph: { title: r.title, description: r.description, url: path, images: [SOCIAL_IMAGE] },
    robots: robotsFor(r.indexable),
  };
}

export function toolMetadata(id: ToolId): Metadata {
  const t = TOOLS[id];
  return {
    title: t.seo.title,
    description: t.seo.description,
    alternates: { canonical: t.route },
    openGraph: { title: t.seo.title, description: t.seo.description, url: t.route, images: [SOCIAL_IMAGE] },
    robots: robotsFor(t.status === "live"),
  };
}

/** Input capture is intentional only on the homepage and tool routes, never information pages. */
export function acceptsScreenshotInput(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return path === "/" || !!toolByRoute(path);
}
