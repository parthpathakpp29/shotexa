import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { acceptsScreenshotInput, sitemapPaths, staticMetadata, STATIC_ROUTES, toolMetadata } from "@/config/routes";
import { isIndexable } from "@/config/site";
import { continuationsFor, LIVE_TOOLS, suggestedNext, suggestedTools, TOOL_GROUPS, TOOL_LIST, toolByRoute, TOOLS, UPCOMING_TOOLS, type ToolId } from "@/config/tools";

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
  });

  it("lists the production tools completed through Phase 2H", () => {
    const live = ["stitch", "combine", "safe-share", "blur", "extract-text", "pdf", "searchable-pdf", "editor", "annotate", "metadata"];
    expect(TOOL_LIST.filter((t) => t.status === "live").map((t) => t.id)).toEqual(live);
    expect(TOOLS.stitch.route).toBe("/stitch-screenshots");
    expect(LIVE_TOOLS).toEqual(live);
    expect(UPCOMING_TOOLS).toEqual(["compress"]);
  });

  it("ships the Screenshot Editor at one canonical route", () => {
    expect(TOOLS.editor).toMatchObject({ route: "/screenshot-editor", status: "live", category: "edit", minFiles: 1 });
    expect(TOOLS.editor.seo.title).toBe("Screenshot Editor Online – Crop, Resize & Rotate | Shotexa");
    expect(TOOLS.editor.seo.h1).toBe("Edit a Screenshot Online");
    // No synonym routes: crop/resize/rotate intents all land on the one editor.
    for (const synonym of ["/crop-screenshot", "/resize-screenshot", "/rotate-screenshot"]) expect(toolByRoute(synonym)).toBeUndefined();
    expect(continuationsFor("editor")).toEqual(["annotate", "safe-share", "extract-text", "pdf", "combine"]);
    // Results people typically crop next can hand off to it.
    for (const from of ["stitch", "combine", "safe-share", "blur"] as ToolId[]) expect(continuationsFor(from)).toContain("editor");
  });

  it("ships Annotation at one canonical route", () => {
    expect(TOOLS.annotate).toMatchObject({ route: "/annotate-screenshot", status: "live", category: "edit", minFiles: 1 });
    expect(TOOLS.annotate.seo.title).toBe("Annotate Screenshot Online – Add Arrows, Text & Highlights | Shotexa");
    expect(TOOLS.annotate.seo.h1).toBe("Annotate a Screenshot Online");
    // No synonym routes: arrow/highlight/text intents all land on the one annotation tool.
    for (const synonym of ["/add-arrow-to-screenshot", "/highlight-screenshot", "/add-text-to-screenshot"]) expect(toolByRoute(synonym)).toBeUndefined();
    // Every result people typically mark up can hand off to it without re-uploading.
    for (const from of ["editor", "stitch", "combine", "safe-share", "blur"] as ToolId[]) expect(continuationsFor(from)).toContain("annotate");
    expect(continuationsFor("annotate")).toEqual(["safe-share", "pdf", "combine", "extract-text", "editor"]);
  });

  it("groups every live tool into exactly one navigation category", () => {
    const grouped = TOOL_GROUPS.flatMap((g) => g.tools);
    expect([...grouped].sort()).toEqual([...LIVE_TOOLS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(TOOL_GROUPS.map((g) => g.id)).toEqual(["create", "protect", "documents", "edit"]);
    expect(TOOL_GROUPS.find((g) => g.id === "edit")?.tools).toEqual(["editor", "annotate"]);
    expect(TOOL_GROUPS.find((g) => g.id === "create")?.tools).toEqual(["stitch", "combine"]);
    expect(TOOL_GROUPS.find((g) => g.id === "protect")?.tools).toEqual(["safe-share", "blur", "metadata"]);
    expect(TOOL_GROUPS.find((g) => g.id === "documents")?.tools).toEqual(["extract-text", "pdf", "searchable-pdf"]);
    // Blur must stay reachable from navigation, not only from its own URL.
    expect(grouped).toContain("blur");
  });

  it("never offers an unfinished tool as a working continuation", () => {
    for (const id of LIVE_TOOLS) {
      const next = continuationsFor(id);
      expect(next).not.toContain(id);
      for (const target of next) expect(TOOLS[target].status).toBe("live");
      expect(next.length).toBeGreaterThan(0);
    }
  });

  it("captures screenshots only on the homepage and tool routes", () => {
    expect(acceptsScreenshotInput("/")).toBe(true);
    expect(acceptsScreenshotInput("/redact-screenshot")).toBe(true);
    expect(acceptsScreenshotInput("/blur-screenshot/")).toBe(true);
    expect(acceptsScreenshotInput("/remove-image-metadata")).toBe(true);
    expect(acceptsScreenshotInput("/screenshot-to-searchable-pdf")).toBe(true);
    expect(acceptsScreenshotInput("/combine-screenshots")).toBe(true);
    expect(acceptsScreenshotInput("/screenshot-editor")).toBe(true);
    expect(acceptsScreenshotInput("/annotate-screenshot")).toBe(true);
    expect(acceptsScreenshotInput("/tools")).toBe(false);
    expect(acceptsScreenshotInput("/privacy")).toBe(false);
  });

  it("suggests only live tools, and multi-image tools only when they apply", () => {
    const single: ToolId[] = ["editor", "annotate", "safe-share", "blur", "extract-text", "pdf", "metadata"];
    expect(suggestedTools(1)).toEqual(single);
    expect(suggestedTools(2)).toEqual(["stitch", "combine", ...single]);
    expect(suggestedTools(5).slice(0, 2)).toEqual(["stitch", "combine"]);
    for (const count of [1, 2, 5]) for (const id of suggestedTools(count)) expect(TOOLS[id].status).toBe("live");
  });

  it("recommends a deterministic next step for each workspace context", () => {
    expect(suggestedNext({ originals: 2 })).toEqual(["stitch", "combine", "safe-share"]);
    expect(suggestedNext({ originals: 1 })).toEqual(["safe-share", "extract-text", "pdf"]);
    // A redacted or metadata-cleaned result should not be sent back through privacy tools.
    for (const producedBy of ["safe-share", "blur", "metadata"] as ToolId[]) {
      expect(suggestedNext({ originals: 1, producedBy })).toEqual(["extract-text", "pdf", "combine"]);
    }
    expect(suggestedNext({ originals: 1, hasOcr: true })).toEqual(["searchable-pdf", "pdf", "safe-share"]);
    expect(suggestedNext({ originals: 1, producedBy: "stitch" })).toEqual(["safe-share", "annotate", "pdf"]);
    for (const ctx of [{ originals: 1 }, { originals: 3 }, { originals: 1, producedBy: "combine" as ToolId }, { originals: 1, hasOcr: true }]) {
      for (const id of suggestedNext(ctx)) expect(TOOLS[id].status).toBe("live");
    }
  });
});

describe("SEO config", () => {
  it("sitemap lists indexable static pages and live tools only", () => {
    expect(sitemapPaths()).toEqual(["/", "/tools", "/privacy", "/stitch-screenshots", "/combine-screenshots", "/redact-screenshot", "/blur-screenshot", "/screenshot-to-text", "/screenshot-to-pdf", "/screenshot-to-searchable-pdf", "/screenshot-editor", "/annotate-screenshot", "/remove-image-metadata"]);
    expect(sitemapPaths().some((p) => p.startsWith("/spikes"))).toBe(false);
  });

  it("sitemap.xml uses absolute URLs on the site origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const entries = sitemap();
    expect(entries.length).toBe(13);
    for (const e of entries) expect(e.url).toMatch(/^https:\/\/[^/]+(\/|$)/);
  });

  it("canonical URLs are the route itself; live Phase 2C tools are indexable", () => {
    vi.stubEnv("SHOTEXA_NOINDEX", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(toolMetadata("stitch")).toMatchObject({ alternates: { canonical: "/stitch-screenshots" }, robots: { index: true } });
    expect(toolMetadata("safe-share")).toMatchObject({ alternates: { canonical: "/redact-screenshot" }, robots: { index: true } });
    expect(toolMetadata("metadata")).toMatchObject({ alternates: { canonical: "/remove-image-metadata" }, robots: { index: true } });
    expect(toolMetadata("editor")).toMatchObject({ title: "Screenshot Editor Online – Crop, Resize & Rotate | Shotexa", alternates: { canonical: "/screenshot-editor" }, robots: { index: true } });
    expect(toolMetadata("annotate")).toMatchObject({
      title: "Annotate Screenshot Online – Add Arrows, Text & Highlights | Shotexa",
      alternates: { canonical: "/annotate-screenshot" },
      robots: { index: true },
    });
    expect(toolMetadata("compress").robots).toMatchObject({ index: false });
    expect(toolMetadata("extract-text")).toMatchObject({
      title: "Screenshot to Text – Free Private OCR | Shotexa",
      alternates: { canonical: "/screenshot-to-text" },
      robots: { index: true },
    });
    expect(toolMetadata("pdf")).toMatchObject({
      title: "Screenshot to PDF – Free & Private Converter | Shotexa",
      alternates: { canonical: "/screenshot-to-pdf" },
      robots: { index: true },
    });
    expect(toolMetadata("searchable-pdf")).toMatchObject({
      title: "Screenshot to Searchable PDF – OCR PDF Converter | Shotexa",
      alternates: { canonical: "/screenshot-to-searchable-pdf" },
      robots: { index: true },
    });
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
