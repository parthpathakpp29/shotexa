/**
 * Tool registry — one entry per genuinely different workflow (architecture §10–12).
 * Drives navigation, tool tabs, "Continue with…", metadata, canonical URLs and the sitemap.
 *
 * status:
 *  - "live"    production tool, indexable, in the sitemap
 *  - "preview" route + workspace shell exist (files carry over) but the tool is not finished:
 *              noindex, not in the sitemap, honest "coming next" state
 */
export type ToolId = "stitch" | "combine" | "safe-share" | "blur" | "extract-text" | "pdf" | "editor" | "annotate" | "compress" | "metadata";

export type ToolStatus = "live" | "preview";
export type ToolIcon = "stitch" | "combine" | "shield" | "blur" | "text" | "pdf" | "crop" | "pen" | "compress" | "eraser";

export interface ToolConfig {
  id: ToolId;
  /** Short name used in tabs and actions. */
  name: string;
  route: `/${string}`;
  status: ToolStatus;
  icon: ToolIcon;
  /** One sentence: what the tool does. */
  summary: string;
  /** Minimum screenshots needed. */
  minFiles: 1 | 2;
  seo: { title: string; h1: string; description: string };
  /** Tools suggested after this one succeeds. */
  continueWith: ToolId[];
}

export const TOOLS: Record<ToolId, ToolConfig> = {
  stitch: {
    id: "stitch",
    name: "Smart Stitch",
    route: "/stitch-screenshots",
    status: "live",
    icon: "stitch",
    summary: "Join overlapping screenshots into one long image automatically.",
    minFiles: 2,
    seo: {
      title: "Stitch Screenshots Online – Smart Screenshot Stitcher | Shotexa",
      h1: "Smart Screenshot Stitcher",
      description: "Automatically join overlapping screenshots into one long image, review the join, adjust it manually and export at full resolution — privately in your browser.",
    },
    continueWith: ["safe-share", "extract-text", "pdf", "annotate", "compress"],
  },
  combine: {
    id: "combine",
    name: "Combine",
    route: "/combine-screenshots",
    status: "preview",
    icon: "combine",
    summary: "Place screenshots side by side or in a stack.",
    minFiles: 2,
    seo: { title: "Combine Screenshots Online – Merge Into One Image | Shotexa", h1: "Combine Screenshots Into One Image", description: "Combine screenshots vertically, horizontally or in a grid — locally in your browser." },
    continueWith: ["safe-share", "pdf", "compress"],
  },
  "safe-share": {
    id: "safe-share",
    name: "Safe Share",
    route: "/redact-screenshot",
    status: "preview",
    icon: "shield",
    summary: "Black out sensitive details and remove private metadata before sharing.",
    minFiles: 1,
    seo: {
      title: "Redact Screenshot Online – Hide Sensitive Information | Shotexa",
      h1: "Redact Sensitive Information From a Screenshot",
      description: "Permanently black out sensitive information and remove private metadata from screenshots, locally in your browser.",
    },
    continueWith: ["pdf", "extract-text", "compress"],
  },
  blur: {
    id: "blur",
    name: "Blur",
    route: "/blur-screenshot",
    status: "preview",
    icon: "blur",
    summary: "Blur or pixelate parts of a screenshot.",
    minFiles: 1,
    seo: { title: "Blur Screenshot Online – Free & Private | Shotexa", h1: "Blur a Screenshot Online", description: "Blur or pixelate parts of a screenshot privately in your browser." },
    continueWith: ["pdf", "compress"],
  },
  "extract-text": {
    id: "extract-text",
    name: "Extract Text",
    route: "/screenshot-to-text",
    status: "preview",
    icon: "text",
    summary: "Copy the text in a screenshot.",
    minFiles: 1,
    seo: { title: "Screenshot to Text – Free Private OCR | Shotexa", h1: "Convert Screenshot to Text", description: "Extract editable text from screenshots with on-device OCR." },
    continueWith: ["pdf", "safe-share"],
  },
  pdf: {
    id: "pdf",
    name: "PDF",
    route: "/screenshot-to-pdf",
    status: "preview",
    icon: "pdf",
    summary: "Turn screenshots into a PDF with smart page breaks.",
    minFiles: 1,
    seo: { title: "Screenshot to PDF – Free & Private Converter | Shotexa", h1: "Convert Screenshots to PDF", description: "Convert screenshots into a PDF with smart page breaks, locally in your browser." },
    continueWith: ["safe-share", "extract-text"],
  },
  editor: {
    id: "editor",
    name: "Edit",
    route: "/screenshot-editor",
    status: "preview",
    icon: "crop",
    summary: "Crop, resize, rotate and flip.",
    minFiles: 1,
    seo: { title: "Screenshot Editor Online – Crop, Resize & Rotate | Shotexa", h1: "Edit a Screenshot Online", description: "Crop, resize, rotate and flip screenshots in your browser." },
    continueWith: ["annotate", "safe-share", "pdf"],
  },
  annotate: {
    id: "annotate",
    name: "Annotate",
    route: "/annotate-screenshot",
    status: "preview",
    icon: "pen",
    summary: "Add arrows, boxes, highlights, text and numbered steps.",
    minFiles: 1,
    seo: { title: "Annotate Screenshot Online – Arrows, Text & Highlights | Shotexa", h1: "Annotate a Screenshot Online", description: "Add arrows, shapes, highlights and text to screenshots." },
    continueWith: ["pdf", "safe-share", "compress"],
  },
  compress: {
    id: "compress",
    name: "Compress",
    route: "/compress-screenshot",
    status: "preview",
    icon: "compress",
    summary: "Make a screenshot file smaller.",
    minFiles: 1,
    seo: { title: "Compress Screenshot Online – Reduce Image Size | Shotexa", h1: "Compress a Screenshot", description: "Reduce screenshot file size locally in your browser." },
    continueWith: ["pdf", "safe-share"],
  },
  metadata: {
    id: "metadata",
    name: "Privacy Clean",
    route: "/remove-image-metadata",
    status: "preview",
    icon: "eraser",
    summary: "Remove GPS, EXIF and other private metadata.",
    minFiles: 1,
    seo: { title: "Remove Image Metadata – Free EXIF & GPS Remover | Shotexa", h1: "Remove Metadata From Images", description: "Remove GPS, EXIF and other privacy-sensitive metadata locally in your browser." },
    continueWith: ["safe-share", "pdf"],
  },
};

export const TOOL_LIST: ToolConfig[] = Object.values(TOOLS);

export const toolById = (id: ToolId): ToolConfig => TOOLS[id];
export const toolByRoute = (route: string): ToolConfig | undefined => TOOL_LIST.find((t) => t.route === route);

/** Contextual actions on the homepage workspace (architecture §14). */
export function suggestedTools(fileCount: number): ToolId[] {
  const one: ToolId[] = ["safe-share", "extract-text", "pdf", "editor", "annotate"];
  return fileCount >= 2 ? ["stitch", "combine", ...one] : one;
}

/** Tool tabs in the workspace header row. */
export const WORKSPACE_TABS: ToolId[] = ["stitch", "extract-text", "safe-share", "pdf", "annotate", "metadata"];
