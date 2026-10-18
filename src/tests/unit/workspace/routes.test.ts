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

  it("lists every production tool from the canonical registry", () => {
    const live = ["pdf-to-jpg", "svg-to-png", "stitch", "combine", "beautify", "compare", "safe-share", "blur", "extract-text", "structured-data", "pdf", "searchable-pdf", "editor", "annotate", "split", "compress", "convert", "metadata", "remove-background", "batch"];
    expect(TOOL_LIST.filter((t) => t.status === "live").map((t) => t.id)).toEqual(live);
    expect(TOOLS.stitch.route).toBe("/stitch-screenshots");
    expect(LIVE_TOOLS).toEqual(live);
    expect(UPCOMING_TOOLS).toEqual([]);
  });

  it("keeps the deferred HEIC converter out of release discovery and indexing", () => {
    expect(toolByRoute("/heic-to-jpg")).toBeUndefined();
    expect(sitemapPaths()).not.toContain("/heic-to-jpg");
    expect(TOOL_GROUPS.flatMap((group) => group.tools)).not.toContain("heic-to-jpg");
  });

  it("ships the Screenshot Editor at one canonical route", () => {
    expect(TOOLS.editor).toMatchObject({ route: "/screenshot-editor", status: "live", category: "edit", minFiles: 1 });
    expect(TOOLS.editor.seo.title).toBe("Screenshot Editor Online – Crop, Resize & Rotate | Shotexa");
    expect(TOOLS.editor.seo.h1).toBe("Edit a Screenshot Online");
    // No synonym routes: crop/resize/rotate intents all land on the one editor.
    for (const synonym of ["/crop-screenshot", "/resize-screenshot", "/rotate-screenshot"]) expect(toolByRoute(synonym)).toBeUndefined();
    expect(continuationsFor("editor")).toEqual(["annotate", "beautify", "compare", "safe-share", "extract-text", "pdf", "combine", "split", "compress", "convert"]);
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
    expect(continuationsFor("annotate")).toEqual(["safe-share", "beautify", "compare", "pdf", "combine", "extract-text", "editor", "split", "compress", "convert"]);
  });

  it("ships Split Long Screenshot at one canonical route", () => {
    expect(TOOLS.split).toMatchObject({ route: "/split-long-screenshot", status: "live", category: "edit", minFiles: 1 });
    expect(TOOLS.split.seo.title).toBe("Split Long Screenshot Online – Cut Into Multiple Images | Shotexa");
    expect(TOOLS.split.seo.h1).toBe("Split a Long Screenshot Into Multiple Images");
    for (const synonym of ["/split-screenshot", "/cut-long-screenshot", "/screenshot-splitter"]) expect(toolByRoute(synonym)).toBeUndefined();
    // Long results hand off to it without re-upload, and its pieces continue anywhere useful.
    for (const from of ["stitch", "combine", "editor", "annotate"] as ToolId[]) expect(continuationsFor(from)).toContain("split");
    expect(continuationsFor("split")).toEqual(["combine", "annotate", "beautify", "editor", "safe-share", "extract-text", "pdf", "compress", "convert"]);
  });

  it("ships Compress and Convert at one canonical route each", () => {
    expect(TOOLS.compress).toMatchObject({ route: "/compress-screenshot", status: "live", category: "edit", minFiles: 1 });
    expect(TOOLS.compress.seo.title).toBe("Compress Screenshot Online – Reduce Image Size | Shotexa");
    expect(TOOLS.compress.seo.h1).toBe("Compress a Screenshot Online");
    expect(TOOLS.convert).toMatchObject({ route: "/convert-screenshot", status: "live", category: "edit", minFiles: 1 });
    expect(TOOLS.convert.seo.title).toBe("Convert Screenshot – PNG, JPEG & WebP | Shotexa");
    expect(TOOLS.convert.seo.h1).toBe("Convert a Screenshot to PNG, JPEG or WebP");
    for (const synonym of ["/png-to-jpg", "/jpg-to-png", "/webp-to-png"]) expect(toolByRoute(synonym)).toBeUndefined();
    for (const id of ["compress", "convert"] as ToolId[]) expect(continuationsFor(id)).toEqual(["editor", "annotate", "beautify", "safe-share", "extract-text", "pdf", "combine"]);
    // Every image tool whose result people commonly shrink hands off to Compress.
    for (const from of ["stitch", "combine", "safe-share", "blur", "editor", "annotate", "split"] as ToolId[]) expect(continuationsFor(from)).toContain("compress");
    for (const from of ["editor", "annotate", "split"] as ToolId[]) expect(continuationsFor(from)).toContain("convert");
  });

  it("ships Compare Screenshots at one canonical route", () => {
    expect(TOOLS.compare).toMatchObject({ route: "/compare-screenshots", status: "live", category: "create", minFiles: 2 });
    expect(TOOLS.compare.seo.title).toBe("Compare Screenshots Online – Visual Diff & Before/After Comparison | Shotexa");
    expect(TOOLS.compare.seo.h1).toBe("Compare Two Screenshots Online");
    for (const synonym of ["/before-after-screenshot", "/image-difference", "/screenshot-diff"]) expect(toolByRoute(synonym)).toBeUndefined();
    // Results people check against an original can hand off to it.
    for (const from of ["editor", "annotate", "beautify", "stitch"] as ToolId[]) expect(continuationsFor(from)).toContain("compare");
    expect(continuationsFor("compare")).toEqual(["editor", "annotate", "beautify", "safe-share", "compress", "pdf"]);
  });

  it("ships Batch Processing at one canonical route", () => {
    expect(TOOLS.batch).toMatchObject({ route: "/batch-screenshots", status: "live", category: "edit", minFiles: 2 });
    expect(TOOLS.batch.seo.title).toBe("Batch Process Screenshots Online – Compress, Convert & Resize | Shotexa");
    expect(TOOLS.batch.seo.h1).toBe("Batch Process Screenshots Online");
    for (const synonym of ["/batch-compress", "/batch-convert", "/bulk-resize", "/bulk-screenshot-tools"]) expect(toolByRoute(synonym)).toBeUndefined();
    expect(continuationsFor("batch")).toEqual(["editor", "safe-share", "extract-text", "pdf"]);
  });

  it("ships Background Remover at one canonical route", () => {
    expect(TOOLS["remove-background"]).toMatchObject({ route: "/remove-background", status: "live", category: "edit", minFiles: 1 });
    expect(TOOLS["remove-background"].seo.title).toBe("Remove Background from Image Online — Private Browser Tool | Shotexa");
    expect(TOOLS["remove-background"].seo.h1).toBe("Remove an Image Background Locally");
    for (const synonym of ["/background-remover", "/remove-image-background", "/transparent-background"]) expect(toolByRoute(synonym)).toBeUndefined();
    expect(continuationsFor("remove-background")[0]).toBe("beautify");
  });

  it("ships the Screenshot Beautifier at one canonical route", () => {
    expect(TOOLS.beautify).toMatchObject({ route: "/screenshot-beautifier", status: "live", category: "create", minFiles: 1 });
    expect(TOOLS.beautify.seo.title).toBe("Screenshot Beautifier – Free Mockups & Backgrounds | Shotexa");
    expect(TOOLS.beautify.seo.h1).toBe("Beautify Screenshots With Templates and Backgrounds");
    // Frame styles live inside this one tool, not as separate routes.
    for (const synonym of ["/browser-frame", "/phone-mockup", "/screenshot-frame", "/screenshot-mockup"]) expect(toolByRoute(synonym)).toBeUndefined();
    // Every result worth presenting can hand off to it.
    for (const from of ["stitch", "combine", "editor", "annotate", "split", "compress", "convert", "safe-share", "blur"] as ToolId[]) expect(continuationsFor(from)).toContain("beautify");
    expect(continuationsFor("beautify")).toEqual(["editor", "annotate", "safe-share", "compare", "compress", "pdf", "combine"]);
  });

  it("groups every live tool into exactly one navigation category", () => {
    const grouped = TOOL_GROUPS.flatMap((g) => g.tools);
    expect([...grouped].sort()).toEqual([...LIVE_TOOLS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(TOOL_GROUPS.map((g) => g.id)).toEqual(["create", "protect", "documents", "edit"]);
    expect(TOOL_GROUPS.find((g) => g.id === "edit")?.tools).toEqual(["svg-to-png", "editor", "annotate", "split", "compress", "convert", "remove-background", "batch"]);
    expect(TOOL_GROUPS.find((g) => g.id === "create")?.tools).toEqual(["stitch", "combine", "beautify", "compare"]);
    expect(TOOL_GROUPS.find((g) => g.id === "protect")?.tools).toEqual(["safe-share", "blur", "metadata"]);
    expect(TOOL_GROUPS.find((g) => g.id === "documents")?.tools).toEqual(["pdf-to-jpg", "extract-text", "structured-data", "pdf", "searchable-pdf"]);
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
    expect(acceptsScreenshotInput("/split-long-screenshot")).toBe(true);
    expect(acceptsScreenshotInput("/compress-screenshot")).toBe(true);
    expect(acceptsScreenshotInput("/convert-screenshot")).toBe(true);
    expect(acceptsScreenshotInput("/screenshot-beautifier")).toBe(true);
    expect(acceptsScreenshotInput("/compare-screenshots")).toBe(true);
    expect(acceptsScreenshotInput("/batch-screenshots")).toBe(true);
    expect(acceptsScreenshotInput("/remove-background")).toBe(true);
    expect(acceptsScreenshotInput("/tools")).toBe(false);
    expect(acceptsScreenshotInput("/privacy")).toBe(false);
  });

  it("suggests only live tools, and multi-image tools only when they apply", () => {
    const single: ToolId[] = ["editor", "annotate", "remove-background", "safe-share", "blur", "extract-text", "structured-data", "pdf", "metadata"];
    expect(suggestedTools(1)).toEqual(single);
    expect(suggestedTools(2)).toEqual(["stitch", "combine", "batch", ...single]);
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
    expect(suggestedNext({ originals: 1, producedBy: "stitch" })).toEqual(["safe-share", "annotate", "beautify"]);
    for (const ctx of [{ originals: 1 }, { originals: 3 }, { originals: 1, producedBy: "combine" as ToolId }, { originals: 1, hasOcr: true }]) {
      for (const id of suggestedNext(ctx)) expect(TOOLS[id].status).toBe("live");
    }
  });
});

describe("SEO config", () => {
  it("sitemap lists indexable static pages and live tools only", () => {
    expect(sitemapPaths()).toEqual(["/", "/tools", "/workflows", "/privacy", "/alternatives", "/alternatives/xnapper", "/alternatives/cleanshot-x", "/alternatives/snagit", "/alternatives/pika", "/alternatives/shots-so", "/pdf-to-jpg", "/svg-to-png", "/stitch-screenshots", "/combine-screenshots", "/screenshot-beautifier", "/compare-screenshots", "/redact-screenshot", "/blur-screenshot", "/screenshot-to-text", "/screenshot-to-data", "/screenshot-to-pdf", "/screenshot-to-searchable-pdf", "/screenshot-editor", "/annotate-screenshot", "/split-long-screenshot", "/compress-screenshot", "/convert-screenshot", "/remove-image-metadata", "/remove-background", "/batch-screenshots"]);
    expect(sitemapPaths().some((p) => p.startsWith("/spikes"))).toBe(false);
  });

  it("sitemap.xml uses absolute URLs on the site origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    const entries = sitemap();
    expect(entries.length).toBe(sitemapPaths().length);
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
    expect(toolMetadata("split")).toMatchObject({
      title: "Split Long Screenshot Online – Cut Into Multiple Images | Shotexa",
      alternates: { canonical: "/split-long-screenshot" },
      robots: { index: true },
    });
    expect(toolMetadata("beautify")).toMatchObject({
      title: "Screenshot Beautifier – Free Mockups & Backgrounds | Shotexa",
      alternates: { canonical: "/screenshot-beautifier" },
      robots: { index: true },
    });
    expect(toolMetadata("compare")).toMatchObject({
      title: "Compare Screenshots Online – Visual Diff & Before/After Comparison | Shotexa",
      alternates: { canonical: "/compare-screenshots" },
      robots: { index: true },
    });
    expect(toolMetadata("compress")).toMatchObject({ title: "Compress Screenshot Online – Reduce Image Size | Shotexa", alternates: { canonical: "/compress-screenshot" }, robots: { index: true } });
    expect(toolMetadata("convert")).toMatchObject({ title: "Convert Screenshot – PNG, JPEG & WebP | Shotexa", alternates: { canonical: "/convert-screenshot" }, robots: { index: true } });
    expect(toolMetadata("batch")).toMatchObject({ title: "Batch Process Screenshots Online – Compress, Convert & Resize | Shotexa", alternates: { canonical: "/batch-screenshots" }, robots: { index: true } });
    expect(toolMetadata("remove-background")).toMatchObject({ title: "Remove Background from Image Online — Private Browser Tool | Shotexa", alternates: { canonical: "/remove-background" }, robots: { index: true } });
    expect(toolMetadata("extract-text")).toMatchObject({
      title: "Screenshot to Text – Free Private OCR | Shotexa",
      alternates: { canonical: "/screenshot-to-text" },
      robots: { index: true },
    });
    expect(toolMetadata("structured-data")).toMatchObject({
      title: "Screenshot to Data – Extract Tables, CSV, XLSX & JSON | Shotexa",
      alternates: { canonical: "/screenshot-to-data" },
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

  it("gives every indexable route distinct, useful metadata", () => {
    const pages = [
      ...STATIC_ROUTES.map((route) => ({ path: route.path, title: route.title, description: route.description })),
      ...TOOL_LIST.filter((tool) => tool.status === "live").map((tool) => ({ path: tool.route, title: tool.seo.title, description: tool.seo.description })),
    ];
    expect(new Set(pages.map((page) => page.path)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.title)).size).toBe(pages.length);
    for (const page of pages) {
      expect(page.title).toContain("Shotexa");
      expect(page.description.length).toBeGreaterThanOrEqual(45);
    }
    for (const page of [staticMetadata("/"), ...TOOL_LIST.filter((tool) => tool.status === "live").map((tool) => toolMetadata(tool.id))]) {
      expect(page.openGraph).toMatchObject({ images: [expect.objectContaining({ url: "/opengraph-image", width: 1200, height: 630 })] });
    }
    expect(staticMetadata("/privacy")).toMatchObject({
      title: "How Shotexa Keeps Screenshots Local | Shotexa",
      alternates: { canonical: "/privacy" },
    });
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
