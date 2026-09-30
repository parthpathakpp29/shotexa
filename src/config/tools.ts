/**
 * Tool registry — one entry per genuinely different workflow (architecture §10–12).
 * Drives navigation, tool tabs, "Continue with…", metadata, canonical URLs and the sitemap.
 *
 * status:
 *  - "live"    production tool, indexable, in the sitemap
 *  - "preview" route + workspace shell exist (files carry over) but the tool is not finished:
 *              noindex, not in the sitemap, honest "coming next" state
 */
export type ToolId = "stitch" | "combine" | "safe-share" | "blur" | "extract-text" | "pdf" | "searchable-pdf" | "editor" | "annotate" | "compress" | "metadata";

export type ToolStatus = "live" | "preview";
export type ToolIcon = "stitch" | "combine" | "shield" | "blur" | "text" | "pdf" | "crop" | "pen" | "compress" | "eraser";

/** Grouping used by every discovery surface (tools page, header menu, footer). */
export type ToolCategory = "create" | "protect" | "documents" | "edit";

export interface ToolConfig {
  id: ToolId;
  /** Short name used in tabs and actions. */
  name: string;
  route: `/${string}`;
  status: ToolStatus;
  icon: ToolIcon;
  category: ToolCategory;
  /** One sentence: what the tool does. */
  summary: string;
  /** Minimum screenshots needed. */
  minFiles: 1 | 2;
  seo: { title: string; h1: string; description: string };
  /**
   * Tools offered after this one succeeds. Only live tools belong here: an unfinished
   * route must never be presented as a normal next action (see `continuationsFor`).
   */
  continueWith: ToolId[];
}

export const TOOLS: Record<ToolId, ToolConfig> = {
  stitch: {
    id: "stitch",
    name: "Smart Stitch",
    route: "/stitch-screenshots",
    status: "live",
    category: "create",
    icon: "stitch",
    summary: "Join overlapping screenshots into one long image automatically.",
    minFiles: 2,
    seo: {
      title: "Stitch Screenshots Online – Smart Screenshot Stitcher | Shotexa",
      h1: "Smart Screenshot Stitcher",
      description: "Automatically join overlapping screenshots into one long image, review the join, adjust it manually and export at full resolution — privately in your browser.",
    },
    continueWith: ["safe-share", "annotate", "pdf", "editor", "extract-text", "combine"],
  },
  combine: {
    id: "combine",
    name: "Combine",
    route: "/combine-screenshots",
    status: "live",
    category: "create",
    icon: "combine",
    summary: "Place screenshots side by side or in a stack.",
    minFiles: 2,
    seo: { title: "Combine Screenshots Online – Merge Into One Image | Shotexa", h1: "Combine Screenshots Into One Image", description: "Combine screenshots vertically, horizontally or in a grid — locally in your browser." },
    continueWith: ["safe-share", "annotate", "editor", "pdf", "extract-text", "metadata"],
  },
  "safe-share": {
    id: "safe-share",
    name: "Safe Share",
    route: "/redact-screenshot",
    status: "live",
    category: "protect",
    icon: "shield",
    summary: "Black out sensitive details and remove private metadata before sharing.",
    minFiles: 1,
    seo: {
      title: "Redact Screenshot Online – Hide Sensitive Information | Shotexa",
      h1: "Redact Sensitive Information From a Screenshot",
      description: "Permanently black out sensitive information and remove private metadata from screenshots, locally in your browser.",
    },
    continueWith: ["extract-text", "pdf", "annotate", "editor", "combine"],
  },
  blur: {
    id: "blur",
    name: "Blur",
    route: "/blur-screenshot",
    status: "live",
    category: "protect",
    icon: "blur",
    summary: "Blur or pixelate parts of a screenshot.",
    minFiles: 1,
    seo: { title: "Blur Screenshot Online – Free & Private | Shotexa", h1: "Blur a Screenshot Online", description: "Blur or pixelate parts of a screenshot privately in your browser." },
    continueWith: ["extract-text", "pdf", "annotate", "editor", "combine"],
  },
  "extract-text": {
    id: "extract-text",
    name: "Extract Text",
    route: "/screenshot-to-text",
    status: "live",
    category: "documents",
    icon: "text",
    summary: "Copy the text in a screenshot.",
    minFiles: 1,
    seo: { title: "Screenshot to Text – Free Private OCR | Shotexa", h1: "Convert Screenshot to Text", description: "Extract editable text from screenshots with on-device OCR." },
    continueWith: ["searchable-pdf", "pdf", "safe-share"],
  },
  pdf: {
    id: "pdf",
    name: "PDF",
    route: "/screenshot-to-pdf",
    status: "live",
    category: "documents",
    icon: "pdf",
    summary: "Turn screenshots into a PDF with smart page breaks.",
    minFiles: 1,
    seo: { title: "Screenshot to PDF – Free & Private Converter | Shotexa", h1: "Convert Screenshots to PDF", description: "Convert screenshots into a PDF with smart page breaks, locally in your browser." },
    continueWith: ["searchable-pdf", "extract-text", "safe-share"],
  },
  "searchable-pdf": {
    id: "searchable-pdf",
    name: "Searchable PDF",
    route: "/screenshot-to-searchable-pdf",
    status: "live",
    category: "documents",
    icon: "pdf",
    summary: "Keep the screenshot look and add a searchable OCR text layer.",
    minFiles: 1,
    seo: {
      title: "Screenshot to Searchable PDF – OCR PDF Converter | Shotexa",
      h1: "Convert Screenshots to Searchable PDF",
      description: "Turn screenshots into searchable PDFs with local OCR and smart page breaks in your browser.",
    },
    continueWith: ["safe-share", "pdf", "extract-text"],
  },
  editor: {
    id: "editor",
    // Not "Edit": it sits in the Edit category, and "Edit / Edit" reads as a mistake.
    name: "Editor",
    route: "/screenshot-editor",
    status: "live",
    category: "edit",
    icon: "crop",
    summary: "Crop, resize, rotate and flip a screenshot.",
    minFiles: 1,
    seo: {
      title: "Screenshot Editor Online – Crop, Resize & Rotate | Shotexa",
      h1: "Edit a Screenshot Online",
      description: "Crop, resize, rotate and flip screenshots at full resolution — privately in your browser. Your original is never changed.",
    },
    continueWith: ["annotate", "safe-share", "extract-text", "pdf", "combine"],
  },
  annotate: {
    id: "annotate",
    name: "Annotate",
    route: "/annotate-screenshot",
    status: "live",
    category: "edit",
    icon: "pen",
    summary: "Add arrows, boxes, highlights, text and numbered steps.",
    minFiles: 1,
    seo: {
      title: "Annotate Screenshot Online – Add Arrows, Text & Highlights | Shotexa",
      h1: "Annotate a Screenshot Online",
      description: "Add arrows, boxes, highlights, text, freehand notes and numbered steps to screenshots at full resolution — privately in your browser. Your original is never changed.",
    },
    continueWith: ["safe-share", "pdf", "combine", "extract-text", "editor"],
  },
  compress: {
    id: "compress",
    name: "Compress",
    route: "/compress-screenshot",
    status: "preview",
    category: "edit",
    icon: "compress",
    summary: "Make a screenshot file smaller.",
    minFiles: 1,
    seo: { title: "Compress Screenshot Online – Reduce Image Size | Shotexa", h1: "Compress a Screenshot", description: "Reduce screenshot file size locally in your browser." },
    continueWith: ["safe-share", "pdf", "combine"],
  },
  metadata: {
    id: "metadata",
    name: "Privacy Clean",
    route: "/remove-image-metadata",
    status: "live",
    category: "protect",
    icon: "eraser",
    summary: "Remove GPS, EXIF and other private metadata.",
    minFiles: 1,
    seo: { title: "Remove Image Metadata – Free EXIF & GPS Remover | Shotexa", h1: "Remove Metadata From Images", description: "Remove GPS, EXIF and other privacy-sensitive metadata locally in your browser." },
    continueWith: ["safe-share", "extract-text", "pdf"],
  },
};

export const TOOL_LIST: ToolConfig[] = Object.values(TOOLS);

export const toolById = (id: ToolId): ToolConfig => TOOLS[id];
export const toolByRoute = (route: string): ToolConfig | undefined => TOOL_LIST.find((t) => t.route === route);

export const isLive = (id: ToolId): boolean => TOOLS[id].status === "live";
/** Every finished tool, in registry order. */
export const LIVE_TOOLS: ToolId[] = TOOL_LIST.filter((t) => t.status === "live").map((t) => t.id);
/** Routes that exist but are not finished; shown only under an explicit "Coming soon". */
export const UPCOMING_TOOLS: ToolId[] = TOOL_LIST.filter((t) => t.status !== "live").map((t) => t.id);

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  create: "Create",
  protect: "Protect",
  documents: "Text & documents",
  edit: "Edit",
};

export interface ToolGroup {
  id: ToolCategory;
  label: string;
  tools: ToolId[];
}

/**
 * Live tools grouped for navigation. One ordered source for the tools page, the header
 * menu and the footer, so a new tool appears everywhere by changing only the registry.
 */
export const TOOL_GROUPS: ToolGroup[] = (["create", "protect", "documents", "edit"] as ToolCategory[])
  .map((id) => ({ id, label: CATEGORY_LABELS[id], tools: LIVE_TOOLS.filter((t) => TOOLS[t].category === id) }))
  .filter((group) => group.tools.length > 0);

/**
 * Next actions after a tool succeeds. Unfinished routes are filtered out here rather than
 * in each component, so no surface can offer a "Coming soon" tool as a working action.
 */
export function continuationsFor(id: ToolId): ToolId[] {
  return TOOLS[id].continueWith.filter(isLive);
}

export interface SuggestionContext {
  /** Original screenshots currently in the workspace. */
  originals: number;
  /** Tool that produced the selected file, when it is a Shotexa result. */
  producedBy?: ToolId;
  /** The selected image already has an OCR result in this session. */
  hasOcr?: boolean;
}

/**
 * Deterministic "what next" for the connected workspace — a small ordered rule list, not a
 * ranking engine. First matching rule wins; every result is a live tool.
 */
export function suggestedNext(ctx: SuggestionContext): ToolId[] {
  if (ctx.hasOcr) return ["searchable-pdf", "pdf", "safe-share"];
  // A privacy result is already redacted and metadata-cleaned: offer what to do with it.
  if (ctx.producedBy && (["safe-share", "blur", "metadata"] as ToolId[]).includes(ctx.producedBy)) {
    return ["extract-text", "pdf", "combine"];
  }
  if (ctx.producedBy) return continuationsFor(ctx.producedBy).slice(0, 3);
  if (ctx.originals >= 2) return ["stitch", "combine", "safe-share"];
  return ["safe-share", "extract-text", "pdf"];
}

/** Tool tabs above the workspace preview; multi-image tools only appear when they apply. */
export function suggestedTools(fileCount: number): ToolId[] {
  const single: ToolId[] = ["editor", "annotate", "safe-share", "blur", "extract-text", "pdf", "metadata"];
  return fileCount >= 2 ? ["stitch", "combine", ...single] : single;
}

