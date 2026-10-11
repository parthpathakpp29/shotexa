/**
 * Plain-language explanations of the workflows: what each one is for, what it produces, and
 * what every step does — written for someone who has never used Shotexa. The recipes in
 * `core/workflows/recipes.ts` stay the source of truth for which steps run; this file only
 * describes them. Custom workflows fall back to the per-action copy at the bottom.
 */
import type { WorkflowAction, WorkflowRecipe, WorkflowStepDefinition } from "@/core/workflows/types";

export interface WorkflowGuide {
  /** One sentence: the result, not the mechanism. */
  outcome: string;
  /** Who reaches for it, when that genuinely helps choose. */
  useCase: string;
  /** "Shotexa will help you…" — a short checklist of what gets done. */
  helps: string[];
  /** The major stages, as they read on a card. */
  pipeline: string[];
  /** What the user downloads at the end. */
  output: { summary: string; formats: string };
}

export const WORKFLOW_GUIDES: Record<string, WorkflowGuide> = {
  "safe-share": {
    outcome: "Hide sensitive information before you send a screenshot.",
    useCase: "For screenshots going to support, a public issue tracker or a group chat.",
    helps: [
      "Find likely emails, phone numbers, keys and card numbers",
      "Choose exactly what gets hidden",
      "Flatten the blackout boxes so they can’t be removed",
      "Remove embedded image metadata",
      "Download the cleaned copy",
    ],
    pipeline: ["Privacy scan", "Review", "Redact", "Remove metadata", "Download"],
    output: { summary: "A cleaned copy of your screenshot", formats: "PNG image" },
  },
  "product-screenshot": {
    outcome: "Turn a raw screenshot into a polished, launch-ready product image.",
    useCase: "For landing pages, launch posts, app listings and social media.",
    helps: [
      "Optionally cut the subject out of its background",
      "Place it on a background or inside a browser or phone frame",
      "Size it for the place you’re posting it",
      "Optimise the file size",
    ],
    pipeline: ["Remove background (optional)", "Style", "Optimise", "Download"],
    output: { summary: "A styled product image", formats: "WebP or PNG, depending on the preset" },
  },
  "bug-report": {
    outcome: "Package a screenshot, your notes and its visible text into one bug report.",
    useCase: "For handing a reproducible problem to a developer or a support team.",
    helps: [
      "Point at the problem with arrows, boxes and step numbers",
      "Copy the text visible in the screenshot",
      "Hide anything private before it’s packaged",
      "Write a title and notes for the report",
    ],
    pipeline: ["Annotate", "Copy text", "Redact", "Package"],
    output: { summary: "A ZIP with the screenshot, a Markdown report, the extracted text and image details", formats: "ZIP" },
  },
  "documentation-pack": {
    outcome: "Turn a set of screenshots into a captioned PDF and editable documentation.",
    useCase: "For how-to guides, onboarding steps and internal handbooks.",
    helps: [
      "Put the screenshots in reading order",
      "Give each one a caption",
      "Optionally add callouts and include the visible text",
      "Create a PDF with sensible page breaks",
    ],
    pipeline: ["Order & caption", "Annotate", "Copy text", "Create PDF", "Package"],
    output: { summary: "A PDF, plus a ZIP with the PDF, an editable Markdown file and the source images", formats: "PDF and ZIP" },
  },
  "web-ready": {
    outcome: "Resize and compress a screenshot so it loads quickly on a website.",
    useCase: "For blog posts, docs sites, help centres and CMS uploads.",
    helps: [
      "Resize to a sensible width for the web",
      "Optionally remove embedded image metadata",
      "Re-encode it at a quality you choose",
    ],
    pipeline: ["Resize", "Remove metadata", "Optimise", "Download"],
    output: { summary: "An optimised image for the web", formats: "WebP, or PNG for the Transparent Asset target" },
  },
  "visual-qa-report": {
    outcome: "Compare a before and after screenshot and get a report of what changed.",
    useCase: "For checking a UI change, a redesign or a regression before release.",
    helps: [
      "Line the two screenshots up automatically",
      "Measure where and how much they differ",
      "Optionally compare the visible text",
      "Write the measurements into a report",
    ],
    pipeline: ["Before & after", "Compare", "Text changes", "Report"],
    output: { summary: "A visual comparison report with the measurements and changed regions", formats: "PDF" },
  },
};

/** How a step relates to the user's image — shown as a small tag, never only as a colour. */
export type StepEffect = "you-choose" | "reads" | "changes-image" | "creates-file";

export const STEP_EFFECT_LABELS: Record<StepEffect, string> = {
  "you-choose": "You decide",
  reads: "Reads only",
  "changes-image": "Changes the image",
  "creates-file": "Creates a file",
};

interface ActionCopy {
  /** Default name and description, used by custom workflows. */
  name: string;
  description: string;
  /** Shown while the step executes. */
  running: string;
  /** Shown while Shotexa waits for the user at this step. */
  review: string;
  effect: StepEffect;
}

export const ACTION_COPY: Record<WorkflowAction, ActionCopy> = {
  input: { name: "Choose screenshots", description: "The screenshots this workflow will use.", running: "Preparing your screenshots…", review: "Check the screenshots and their order, then continue.", effect: "you-choose" },
  "privacy-scan": { name: "Scan for private details", description: "Reads the visible text on this device and looks for likely sensitive details.", running: "Scanning for private details…", review: "Continue to scan the screenshot.", effect: "reads" },
  "privacy-review": { name: "Review what was found", description: "You choose which findings get hidden. Nothing is hidden automatically.", running: "Applying your choices…", review: "Choose which findings to hide, then continue.", effect: "you-choose" },
  "redact-review": { name: "Check the redactions", description: "Move, resize or add blackout boxes over anything that should be hidden.", running: "Saving the redactions…", review: "Check every box covers what it should, then continue.", effect: "you-choose" },
  "annotation-review": { name: "Mark up the screenshot", description: "Add arrows, boxes, highlights, text or numbered steps.", running: "Saving your annotations…", review: "Draw on the screenshot, then continue — or skip this step.", effect: "you-choose" },
  "remove-background": { name: "Remove the background", description: "Cuts the subject out of its background on this device.", running: "Removing the background…", review: "Continue to remove the background.", effect: "changes-image" },
  beautify: { name: "Style the screenshot", description: "Adds a background or frame and sets the final size.", running: "Rendering the styled image…", review: "Adjust the style in the settings, then continue.", effect: "changes-image" },
  resize: { name: "Resize", description: "Scales the image to a new width, keeping its proportions.", running: "Resizing…", review: "Continue to resize the image.", effect: "changes-image" },
  ocr: { name: "Copy the visible text", description: "Reads the text in the screenshot on this device.", running: "Reading the visible text…", review: "Continue to read the text, or skip this step.", effect: "reads" },
  compare: { name: "Compare the screenshots", description: "Aligns the two screenshots and measures what changed.", running: "Measuring the differences…", review: "Review the changed regions, then continue.", effect: "reads" },
  "compare-text-diff": { name: "Compare the text", description: "Reads the text in both screenshots and lists what changed.", running: "Comparing the visible text…", review: "Continue to compare the text — it takes longer — or skip it.", effect: "reads" },
  "compare-report": { name: "Create the report", description: "Writes the measurements into a comparison report.", running: "Building the report…", review: "Continue to create the report.", effect: "creates-file" },
  "structured-extract": { name: "Extract tables and data", description: "Rebuilds tables, fields or code from the screenshot’s text.", running: "Extracting structured data…", review: "Continue to extract the data.", effect: "reads" },
  "export-csv": { name: "Create a CSV file", description: "Saves the extracted table as CSV.", running: "Creating the CSV file…", review: "Continue to create the CSV file.", effect: "creates-file" },
  "export-xlsx": { name: "Create an XLSX file", description: "Saves the extracted tables as a spreadsheet.", running: "Creating the spreadsheet…", review: "Continue to create the spreadsheet.", effect: "creates-file" },
  "export-json": { name: "Create a JSON file", description: "Saves the extracted data as JSON.", running: "Creating the JSON file…", review: "Continue to create the JSON file.", effect: "creates-file" },
  "export-markdown": { name: "Create a Markdown file", description: "Saves the extracted content as Markdown.", running: "Creating the Markdown file…", review: "Continue to create the Markdown file.", effect: "creates-file" },
  "privacy-clean": { name: "Flatten and remove metadata", description: "Burns redactions into a new copy and removes embedded image metadata.", running: "Flattening redactions and removing metadata…", review: "Continue to flatten the redactions and remove metadata.", effect: "changes-image" },
  "metadata-remove": { name: "Remove metadata", description: "Removes embedded details such as location, camera and software information.", running: "Removing image metadata…", review: "Continue to remove the metadata, or skip to keep it.", effect: "changes-image" },
  compress: { name: "Optimise file size", description: "Re-encodes the image at the chosen format and quality.", running: "Optimising the file size…", review: "Continue to optimise the file, or skip to keep it as it is.", effect: "changes-image" },
  convert: { name: "Convert the format", description: "Saves the image as PNG, JPEG or WebP.", running: "Converting the format…", review: "Continue to convert the image.", effect: "changes-image" },
  watermark: { name: "Add a watermark", description: "Places a logo from your workspace on the image.", running: "Adding the watermark…", review: "Choose the logo in the settings, then continue.", effect: "changes-image" },
  pdf: { name: "Create a PDF", description: "Lays the screenshots out as PDF pages with smart page breaks.", running: "Creating the PDF…", review: "Continue to create the PDF.", effect: "creates-file" },
  "package-bug-report": { name: "Build the report", description: "Packages the screenshot, notes and text into a ZIP.", running: "Packaging the bug report…", review: "Continue to build the report.", effect: "creates-file" },
  "package-documentation": { name: "Package the documentation", description: "Packages the PDF, Markdown and source images into a ZIP.", running: "Packaging the documentation…", review: "Continue to package the documentation.", effect: "creates-file" },
  export: { name: "Download", description: "Prepares the final file for download.", running: "Preparing the download…", review: "Continue to prepare the download.", effect: "creates-file" },
};

export function guideFor(recipe: WorkflowRecipe): WorkflowGuide {
  const known = WORKFLOW_GUIDES[recipe.id];
  if (known) return known;
  const steps = recipe.steps.filter((step) => step.action !== "input" && step.enabled !== false);
  return {
    outcome: recipe.description,
    useCase: "Your own saved sequence of Shotexa steps.",
    helps: steps.map((step) => step.name),
    pipeline: steps.map((step) => step.name),
    output: { summary: OUTPUT_SUMMARY[recipe.output.kind], formats: recipe.output.filename },
  };
}

const OUTPUT_SUMMARY: Record<WorkflowRecipe["output"]["kind"], string> = {
  image: "An image file",
  images: "Image files",
  pdf: "A PDF",
  zip: "A ZIP archive",
};

export const stepEffect = (step: WorkflowStepDefinition): StepEffect => (step.review && step.action !== "input" && ACTION_COPY[step.action].effect === "you-choose" ? "you-choose" : ACTION_COPY[step.action].effect);

/** "Uses one screenshot", "Uses one to three screenshots", "Uses two screenshots"… */
export function inputRequirement(recipe: WorkflowRecipe): string {
  const { min, max } = recipe.input;
  const word = (n: number) => ["no", "one", "two", "three", "four", "five", "six"][n] ?? String(n);
  if (max === min) return `Uses ${word(min)} screenshot${min === 1 ? "" : "s"}`;
  if (max) return `Uses ${word(min)} to ${word(max)} screenshots`;
  return min === 1 ? "Uses one or more screenshots" : `Uses ${word(min)} or more screenshots`;
}
