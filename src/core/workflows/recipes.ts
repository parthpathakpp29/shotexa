import type { WorkflowRecipe } from "./types";

const accepts = ["image/png", "image/jpeg", "image/webp"] as const;

export const SAFE_SHARE_RECIPE: WorkflowRecipe = {
  id: "safe-share",
  name: "Safe Share",
  description: "Hide sensitive information before you send a screenshot.",
  icon: "shield",
  category: "protect",
  input: { min: 1, max: 1, accepts, label: "One screenshot" },
  builtIn: true,
  estimatedOperations: 7,
  output: { kind: "image", filename: "safe-share.png" },
  steps: [
    { id: "input", name: "Choose screenshot", description: "The screenshot you want to share safely.", action: "input", config: {} },
    { id: "privacy-scan", name: "Scan for private details", description: "Reads the visible text on this device and looks for likely emails, phone numbers, keys and card numbers.", action: "privacy-scan", config: { preset: "maximum", includeLowConfidence: true, detectBarcodes: true } },
    { id: "privacy-review", name: "Review what was found", description: "You choose which findings get hidden. Nothing is hidden automatically.", action: "privacy-review", config: {}, review: true },
    { id: "redact", name: "Check the redactions", description: "Your choices become blackout boxes. Move or resize them, and add boxes for anything the scan missed.", action: "redact-review", config: { mode: "blackout" }, review: true },
    { id: "privacy-clean", name: "Flatten and remove metadata", description: "Burns the boxes into a new copy, removes embedded image metadata and checks the result. Your original stays unchanged.", action: "privacy-clean", config: { requireRedactions: true }, destructive: true },
    { id: "compress", name: "Make the file smaller", description: "Optionally re-encode the cleaned copy to reduce its file size.", action: "compress", config: { format: "same", quality: 0.86 }, optional: true, review: true },
    { id: "export", name: "Download", description: "Prepares the cleaned screenshot for download.", action: "export", config: { filename: "safe-share.png" } },
  ],
};

export const PRODUCT_SCREENSHOT_RECIPE: WorkflowRecipe = {
  id: "product-screenshot",
  name: "Product Screenshot",
  description: "Turn a raw screenshot into a polished, launch-ready product image.",
  icon: "sparkles",
  category: "create",
  input: { min: 1, max: 3, accepts, label: "One to three screenshots" },
  builtIn: true,
  estimatedOperations: 5,
  output: { kind: "image", filename: "product-screenshot.webp" },
  steps: [
    { id: "input", name: "Choose screenshots", description: "One screenshot, or up to three to show side by side.", action: "input", config: { multiple: true } },
    { id: "remove-background", name: "Remove the background", description: "Cuts the subject out of its background on this device. Turn it off to keep the whole screenshot.", action: "remove-background", config: { trim: false, padding: 0 }, optional: true },
    { id: "beautify", name: "Style the screenshot", description: "Choose the background, frame, size and perspective. Nothing is saved until you continue.", action: "beautify", config: { preset: "saas-hero", canvas: "16:9", format: "webp", quality: 0.86 }, review: true },
    { id: "compress", name: "Optimise file size", description: "Optionally make the styled image smaller.", action: "compress", config: { format: "webp", quality: 0.84 }, optional: true, review: true },
    { id: "export", name: "Download", description: "Prepares the polished image for download.", action: "export", config: { filename: "product-screenshot.webp" } },
  ],
};

export const BUG_REPORT_RECIPE: WorkflowRecipe = {
  id: "bug-report",
  name: "Bug Report",
  description: "Package a screenshot, your notes and its visible text into one bug report.",
  icon: "bug",
  category: "document",
  input: { min: 1, max: 1, accepts, label: "One screenshot" },
  builtIn: true,
  estimatedOperations: 5,
  output: { kind: "zip", filename: "bug-report.zip" },
  steps: [
    { id: "input", name: "Choose screenshot", description: "The screenshot that shows the problem.", action: "input", config: {} },
    { id: "annotate", name: "Mark the problem", description: "Add arrows, boxes, labels or numbered steps.", action: "annotation-review", config: {}, review: true, optional: true },
    { id: "ocr", name: "Copy the visible text", description: "Reads the text in the screenshot on this device so it can go into the report.", action: "ocr", config: { language: "eng" }, optional: true, review: true },
    { id: "redact", name: "Hide private details", description: "Optionally cover anything that shouldn’t be in the report.", action: "redact-review", config: { mode: "blackout" }, review: true, optional: true },
    { id: "package", name: "Build the report", description: "Creates a ZIP with the screenshot, a Markdown report with your notes, the extracted text and basic image details.", action: "package-bug-report", config: { includeText: true, title: "Bug report", notes: "" } },
  ],
};

export const DOCUMENTATION_RECIPE: WorkflowRecipe = {
  id: "documentation-pack",
  name: "Documentation Pack",
  description: "Turn a set of screenshots into a captioned PDF and editable documentation.",
  icon: "book",
  category: "document",
  input: { min: 1, accepts, label: "One or more screenshots" },
  builtIn: true,
  estimatedOperations: 4,
  output: { kind: "zip", filename: "documentation-pack.zip" },
  steps: [
    { id: "input", name: "Order and caption", description: "Put the screenshots in reading order and give each one a caption.", action: "input", config: { multiple: true }, review: true },
    { id: "annotate", name: "Add callouts", description: "Optionally add arrows or step numbers to the first screenshot.", action: "annotation-review", config: {}, review: true, optional: true },
    { id: "ocr", name: "Include the visible text", description: "Optionally read the text in each screenshot and add it to the Markdown file.", action: "ocr", config: { language: "eng", allInputs: true }, optional: true, review: true },
    { id: "pdf", name: "Create the PDF", description: "Lays the screenshots out on A4 pages, moving page breaks away from content where it can.", action: "pdf", config: { paper: "a4", smart: true } },
    { id: "package", name: "Package everything", description: "Creates a ZIP with the PDF, an editable Markdown file and the source images.", action: "package-documentation", config: { includeMarkdown: true, includeImages: true, captions: {} } },
  ],
};

export const WEB_READY_RECIPE: WorkflowRecipe = {
  id: "web-ready",
  name: "Web Ready",
  description: "Resize and compress a screenshot so it loads quickly on a website.",
  icon: "globe",
  category: "optimise",
  input: { min: 1, max: 1, accepts, label: "One screenshot" },
  builtIn: true,
  estimatedOperations: 4,
  output: { kind: "image", filename: "web-ready.webp" },
  steps: [
    { id: "input", name: "Choose screenshot", description: "The screenshot you want to publish.", action: "input", config: {} },
    { id: "resize", name: "Resize", description: "Scales the screenshot to the target width, keeping its proportions.", action: "resize", config: { width: 1600, lockAspect: true } },
    { id: "metadata", name: "Remove metadata", description: "Optionally remove embedded details such as location, camera and software information.", action: "metadata-remove", config: {}, optional: true, review: true },
    { id: "compress", name: "Optimise file size", description: "Re-encodes the image in the target’s format and quality.", action: "compress", config: { format: "webp", quality: 0.82 } },
    { id: "export", name: "Download", description: "Prepares the web-ready image for download.", action: "export", config: { filename: "web-ready.webp" } },
  ],
};

export const VISUAL_QA_RECIPE: WorkflowRecipe = {
  id: "visual-qa-report",
  name: "Visual QA Report",
  description: "Compare a before and after screenshot and get a report of what changed.",
  icon: "compare",
  category: "document",
  input: { min: 2, max: 2, accepts, label: "Two screenshots (before and after)" },
  builtIn: true,
  estimatedOperations: 4,
  output: { kind: "pdf", filename: "comparison-report.pdf" },
  steps: [
    { id: "input", name: "Choose before and after", description: "The first screenshot is Before and the second is After. Swap them if they’re the wrong way round.", action: "input", config: { multiple: true }, review: true },
    { id: "compare", name: "Compare the screenshots", description: "Lines them up, measures what changed and outlines each changed region for you to review.", action: "compare", config: { preset: "visual-qa", mode: "difference", alignment: "auto" }, review: true },
    { id: "text-diff", name: "Compare the text", description: "Optionally reads the text in both screenshots on this device and lists what was added, removed or changed.", action: "compare-text-diff", config: {}, optional: true, review: true },
    { id: "report", name: "Create the report", description: "Writes what was measured into a PDF comparison report.", action: "compare-report", config: { format: "pdf" } },
  ],
};

export const BUILT_IN_WORKFLOWS = [SAFE_SHARE_RECIPE, PRODUCT_SCREENSHOT_RECIPE, BUG_REPORT_RECIPE, DOCUMENTATION_RECIPE, WEB_READY_RECIPE, VISUAL_QA_RECIPE] as const;

export function workflowById(id: string): WorkflowRecipe | undefined {
  return BUILT_IN_WORKFLOWS.find((recipe) => recipe.id === id);
}

export const PRODUCT_QUICK_PRESETS = [
  { id: "saas-launch", label: "SaaS Launch", preset: "saas-hero", canvas: "16:9", format: "webp" },
  { id: "product-hunt", label: "Product Hunt", preset: "product-launch", canvas: "product-hunt", format: "png" },
  { id: "linkedin", label: "LinkedIn", preset: "social-post", canvas: "linkedin-post", format: "png" },
  { id: "x-twitter", label: "X / Twitter", preset: "gradient-pro", canvas: "x-post", format: "webp" },
  { id: "documentation", label: "Documentation", preset: "documentation", canvas: "auto", format: "png" },
  { id: "website-hero", label: "Website Hero", preset: "minimal-light", canvas: "landscape-1600", format: "webp" },
] as const;

export const WEB_READY_PRESETS = [
  { id: "balanced", label: "Balanced", width: 1600, format: "webp", quality: 0.82 },
  { id: "small-file", label: "Small File", width: 1280, format: "webp", quality: 0.72 },
  { id: "high-quality", label: "High Quality", width: 2000, format: "webp", quality: 0.92 },
  { id: "transparent", label: "Transparent Asset", width: 1600, format: "png", quality: 1 },
] as const;
