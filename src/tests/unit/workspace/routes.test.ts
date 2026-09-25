import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { sitemapPaths, staticMetadata, STATIC_ROUTES, toolMetadata } from "@/config/routes";
import { isIndexable } from "@/config/site";
import { suggestedTools, TOOL_LIST, toolByRoute, TOOLS, WORKSPACE_TABS, type ToolId } from "@/config/tools";

afterEach(() => vi.unstubAllEnvs());

describe("tool registry", () => {
  it("has one unique route per tool and valid references", () => {
    const routes = TOOL_LIST.map((t) => t.route);
    expect(new Set(routes).size).toBe(routes.length);
    for (const t of TOOL_LIST) {
      expect(t.route).toMatch(/^\/[a-z0-9-]+$/);
      expect(toolByRoute(t.route)).toBe(t);
      for (const next of t.continueWith) expect(TOOLS[next]).toBeDefined();
      expect(t.continueWith).not.toContain(t.id);
    }
    for (const id of WORKSPACE_TABS) expect(TOOLS[id]).toBeDefined();
  });

  it("Smart Stitch is the only live tool in Phase 1", () => {
    expect(TOOL_LIST.filter((t) => t.status === "live").map((t) => t.id)).toEqual(["stitch"]);
    expect(TOOLS.stitch.route).toBe("/stitch-screenshots");
    expect(TOOLS.stitch.continueWith).toEqual(["safe-share", "extract-text", "pdf", "annotate", "compress"]);
  });

  it("suggests tools by screenshot count", () => {
    const one: ToolId[] = ["safe-share", "extract-text", "pdf", "editor", "annotate"];
    expect(suggestedTools(1)).toEqual(one);
    expect(suggestedTools(2)).toEqual(["stitch", "combine", ...one]);
    expect(suggestedTools(5).slice(0, 2)).toEqual(["stitch", "combine"]);
  });
});

describe("SEO config", () => {
  it("sitemap lists indexable static pages and live tools only", () => {
    expect(sitemapPaths()).toEqual(["/", "/tools", "/privacy", "/stitch-screenshots"]);
    expect(sitemapPaths().some((p) => p.startsWith("/spikes"))).toBe(false);
  });

  it("sitemap.xml uses absolute URLs on the site origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const entries = sitemap();
    expect(entries.length).toBe(4);
    for (const e of entries) expect(e.url).toMatch(/^https:\/\/[^/]+(\/|$)/);
  });

  it("canonical URLs are the route itself; preview tools are noindex", () => {
    vi.stubEnv("SHOTEXA_NOINDEX", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(toolMetadata("stitch")).toMatchObject({ alternates: { canonical: "/stitch-screenshots" }, robots: { index: true } });
    expect(toolMetadata("safe-share")).toMatchObject({ alternates: { canonical: "/redact-screenshot" }, robots: { index: false } });
    for (const r of STATIC_ROUTES) expect(staticMetadata(r.path)).toMatchObject({ alternates: { canonical: r.path } });
  });

  it("previews and non-production deploys are never indexable", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isIndexable()).toBe(false);
    expect(toolMetadata("stitch").robots).toMatchObject({ index: false });
    expect(robots().rules).toMatchObject({ disallow: "/" });
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SHOTEXA_NOINDEX", "1");
    expect(isIndexable()).toBe(false);
  });

  it("production robots allow the site but not spikes, and point at the sitemap", () => {
    vi.stubEnv("SHOTEXA_NOINDEX", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const r = robots();
    expect(r.rules).toMatchObject({ allow: "/", disallow: expect.arrayContaining(["/spikes/"]) });
    expect(String(r.sitemap)).toMatch(/\/sitemap\.xml$/);
  });
});
