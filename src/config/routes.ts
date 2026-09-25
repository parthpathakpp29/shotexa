/**
 * Route metadata helpers: canonical URLs, indexability and the sitemap list.
 * One genuinely different intent = one indexable page (architecture §10). Unfinished tool
 * routes exist for workspace continuity but stay noindex and out of the sitemap.
 */
import type { Metadata } from "next";
import { isIndexable } from "./site";
import { TOOL_LIST, TOOLS, type ToolId } from "./tools";

export interface StaticRoute {
  path: `/${string}`;
  title: string;
  description: string;
  indexable: boolean;
}

export const STATIC_ROUTES: StaticRoute[] = [
  { path: "/", title: "Shotexa – Free Private Screenshot Tools Online", description: "Stitch screenshots, hide sensitive information, extract text and create PDFs directly in your browser. Files stay on your device.", indexable: true },
  { path: "/tools", title: "All Screenshot Tools | Shotexa", description: "Every Shotexa screenshot tool — stitch, redact, extract text, PDF and more, all processed locally in your browser.", indexable: true },
  { path: "/privacy", title: "Privacy | Shotexa", description: "How Shotexa keeps your screenshots on your device.", indexable: true },
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
    openGraph: { title: r.title, description: r.description, url: path },
    robots: robotsFor(r.indexable),
  };
}

export function toolMetadata(id: ToolId): Metadata {
  const t = TOOLS[id];
  return {
    title: t.seo.title,
    description: t.seo.description,
    alternates: { canonical: t.route },
    openGraph: { title: t.seo.title, description: t.seo.description, url: t.route },
    robots: robotsFor(t.status === "live"),
  };
}
