export type FormatConversionId = "pdf-to-png" | "svg-to-jpg" | "webp-to-png" | "webp-to-jpg" | "png-to-jpg" | "jpg-to-png";

export interface FormatConversion {
  id: FormatConversionId;
  name: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  source: "PDF" | "SVG" | "WebP" | "PNG" | "JPG";
  output: "PNG" | "JPG";
  engine: "pdf" | "svg" | "raster";
  rasterSource?: "image/webp" | "image/png" | "image/jpeg";
  rasterOutput?: "png" | "jpeg";
  benefits: { title: string; detail: string }[];
  limits: string[];
  faq: { q: string; a: string }[];
  related: { label: string; href: `/${string}` }[];
}

export const FORMAT_CONVERSIONS: Record<FormatConversionId, FormatConversion> = {
  "pdf-to-png": {
    id: "pdf-to-png", name: "PDF to PNG", title: "PDF to PNG Converter — Select Pages & Resolution | Shotexa",
    h1: "Convert PDF Pages to PNG", description: "Choose PDF pages and render them as PNG images at a resolution you control. Preview pages, download individually or as a ZIP, all in your browser.",
    intro: "PNG is useful when a PDF page contains diagrams, UI text or flat graphics that should not gain JPEG compression artifacts. Preview the document, select the pages you need and choose a render scale before exporting.",
    source: "PDF", output: "PNG", engine: "pdf",
    benefits: [{ title: "Keep crisp edges", detail: "Lossless PNG encoding avoids new JPEG artifacts around small text, diagrams and interface lines." }, { title: "Choose only needed pages", detail: "Preview the PDF, select pages and download each PNG or a ZIP of the selection." }, { title: "Continue editing", detail: "Converted pages become temporary workspace images for Shotexa's Editor, Beautifier and Compress tools." }],
    limits: ["This rasterizes the visible page; selectable PDF text and vector editability are not preserved.", "A PNG page can be larger than a JPG, especially for photographic content.", "Password-protected PDFs must be unlocked first; browser memory limits cap very large documents and export batches."],
    faq: [{ q: "Does PNG keep PDF text editable?", a: "No. Each output is a raster image of the page. Use a suitable resolution for readable text." }, { q: "Can I convert just one page?", a: "Yes. Clear the page selection, choose the page you want and export only that page." }, { q: "Why is my PNG larger than a JPG?", a: "PNG is lossless. For photo-heavy pages, JPG often makes a smaller file at the cost of some detail." }],
    related: [{ label: "PDF to JPG", href: "/pdf-to-jpg" }, { label: "Compress a screenshot", href: "/compress-screenshot" }, { label: "Image converter", href: "/convert-screenshot" }],
  },
  "svg-to-jpg": {
    id: "svg-to-jpg", name: "SVG to JPG", title: "SVG to JPG Converter — Choose Size & Background | Shotexa",
    h1: "Convert SVG Artwork to JPG", description: "Rasterize supported passive SVG artwork to JPG in your browser. Choose dimensions, quality and a background color for transparent areas.",
    intro: "JPG works well when a destination requires a conventional photo-style image instead of a vector file. Set the raster size explicitly and choose the color that fills transparent parts of the SVG.",
    source: "SVG", output: "JPG", engine: "svg",
    benefits: [{ title: "Choose the final dimensions", detail: "Rasterize at a specific width and height, with aspect-ratio lock available." }, { title: "Control transparency loss", detail: "Pick a solid background because JPG cannot store transparent pixels." }, { title: "Work locally", detail: "Shotexa validates passive SVG content and rejects scripts and external references before drawing it." }],
    limits: ["JPG is lossy and cannot retain transparency or vector editability.", "Complex SVG features, embedded images and external resources may be rejected by the safety validator.", "Export size is limited by the browser's canvas and Shotexa's pixel guard."],
    faq: [{ q: "What happens to transparent areas?", a: "They are filled with your selected JPG background color. Choose SVG to PNG if you need transparency." }, { q: "Will the JPG stay sharp when enlarged later?", a: "No. Pick a large enough output size before conversion; the exported JPG has fixed pixels." }, { q: "Why was my SVG rejected?", a: "The browser converter accepts passive SVG shapes and text, but rejects active content, embedded images and external resources." }],
    related: [{ label: "SVG to PNG", href: "/svg-to-png" }, { label: "JPG to PNG", href: "/jpg-to-png" }, { label: "Image converter", href: "/convert-screenshot" }],
  },
  "webp-to-png": {
    id: "webp-to-png", name: "WebP to PNG", title: "WebP to PNG Converter — Keep Transparency | Shotexa",
    h1: "Convert a WebP Image to PNG", description: "Convert a WebP image to a lossless PNG without changing its pixel dimensions. Keep transparency where the decoded source has it, locally in your browser.",
    intro: "PNG is a practical choice for editing a WebP screenshot, logo or UI asset in an application that does not accept WebP. Shotexa decodes the source and writes a new PNG at the same width and height.",
    source: "WebP", output: "PNG", engine: "raster", rasterSource: "image/webp", rasterOutput: "png",
    benefits: [{ title: "Keep transparent pixels", detail: "A transparent WebP can remain transparent in the PNG result." }, { title: "No new lossy step", detail: "PNG encoding is lossless for the pixels decoded from the WebP source." }, { title: "Edit the result", detail: "The converted PNG joins your temporary workspace for annotation, redaction or PDF creation." }],
    limits: ["Conversion cannot restore detail already lost by lossy WebP compression.", "PNG files are often larger than WebP.", "Animated WebP is not preserved as animation; this workflow exports a still image."],
    faq: [{ q: "Will the PNG be transparent?", a: "Yes, if the decoded WebP contains transparent pixels. Opaque WebP images remain opaque." }, { q: "Will it improve image quality?", a: "No. It avoids further lossy encoding, but cannot recover detail missing from the original WebP." }, { q: "Does it resize the image?", a: "No. The output keeps the source pixel dimensions." }],
    related: [{ label: "WebP to JPG", href: "/webp-to-jpg" }, { label: "PNG to JPG", href: "/png-to-jpg" }, { label: "Image converter", href: "/convert-screenshot" }],
  },
  "webp-to-jpg": {
    id: "webp-to-jpg", name: "WebP to JPG", title: "WebP to JPG Converter — Quality & Background | Shotexa",
    h1: "Convert a WebP Image to JPG", description: "Turn a WebP image into a JPG at the same pixel size. Adjust JPEG quality and choose a background for transparent areas, entirely in your browser.",
    intro: "Use JPG when a form, document workflow or older image viewer does not accept WebP. The quality slider controls the new JPEG encode, while a chosen background fills any transparency.",
    source: "WebP", output: "JPG", engine: "raster", rasterSource: "image/webp", rasterOutput: "jpeg",
    benefits: [{ title: "Broad compatibility", detail: "JPG is widely accepted by photo viewers, forms and document tools." }, { title: "Choose file size versus detail", detail: "Adjust JPEG quality and check the measured output before downloading." }, { title: "Handle transparency deliberately", detail: "Set the solid color used where the WebP image has transparent pixels." }],
    limits: ["JPG cannot store transparency; transparent regions are filled.", "JPEG is lossy, so repeated conversion can soften text or fine edges.", "Animated WebP is exported as a still image."],
    faq: [{ q: "What happens to WebP transparency?", a: "JPG cannot keep it. Shotexa fills transparent pixels with the background color you select." }, { q: "Can I choose JPEG quality?", a: "Yes. Adjust the quality control and check file size before export." }, { q: "Does Shotexa upload my WebP?", a: "No. This conversion runs in the browser; the optional Safe Share cloud feature is separate." }],
    related: [{ label: "WebP to PNG", href: "/webp-to-png" }, { label: "PNG to JPG", href: "/png-to-jpg" }, { label: "Image converter", href: "/convert-screenshot" }],
  },
  "png-to-jpg": {
    id: "png-to-jpg", name: "PNG to JPG", title: "PNG to JPG Converter — Quality & Background | Shotexa",
    h1: "Convert a PNG Image to JPG", description: "Convert PNG to JPG locally with adjustable quality and a chosen background for transparent pixels. Check the actual file size before export.",
    intro: "JPG can be a smaller and more compatible choice for photographic PNGs. For screenshots with fine text, inspect the result before downloading because JPEG compression can introduce visible edges and blur.",
    source: "PNG", output: "JPG", engine: "raster", rasterSource: "image/png", rasterOutput: "jpeg",
    benefits: [{ title: "Tune the JPEG", detail: "Use the quality control and measured output size to choose your own balance." }, { title: "Choose an alpha fill", detail: "Transparent PNG pixels need a solid JPG background; white, black, cream and custom colors are available." }, { title: "Keep the original", detail: "The JPG becomes a separate workspace result; the uploaded PNG is not overwritten." }],
    limits: ["JPG loses transparency and uses lossy compression.", "Text-heavy screenshots and flat graphics may look better and even be smaller as PNG or WebP.", "Changing the extension alone does not convert pixels; Shotexa re-encodes them."],
    faq: [{ q: "Will a PNG always get smaller?", a: "No. Photos often shrink, but flat graphics can be efficient as PNG. Shotexa shows the measured result size." }, { q: "How are transparent pixels handled?", a: "They are filled with the background color you select because JPG has no alpha channel." }, { q: "Is the original PNG changed?", a: "No. Shotexa adds and downloads a new JPG while keeping the source in the workspace." }],
    related: [{ label: "JPG to PNG", href: "/jpg-to-png" }, { label: "WebP to JPG", href: "/webp-to-jpg" }, { label: "Compress an image", href: "/compress-screenshot" }],
  },
  "jpg-to-png": {
    id: "jpg-to-png", name: "JPG to PNG", title: "JPG to PNG Converter — Lossless Re-Export | Shotexa",
    h1: "Convert a JPG Image to PNG", description: "Convert JPG or JPEG images into PNG files at the same pixel size. Make a lossless PNG copy locally, without uploading your image.",
    intro: "A PNG copy helps when an editor, documentation system or design workflow requires PNG. The new file keeps the decoded JPEG pixels without adding another lossy encode, but it cannot restore detail previously discarded by JPEG compression.",
    source: "JPG", output: "PNG", engine: "raster", rasterSource: "image/jpeg", rasterOutput: "png",
    benefits: [{ title: "No extra JPEG loss", detail: "The PNG stores the decoded pixels losslessly for future edits." }, { title: "Same dimensions", detail: "Shotexa keeps the source width and height during format conversion." }, { title: "Continue in Shotexa", detail: "Use the result in Editor, Beautifier, PDF, or privacy tools without a second upload." }],
    limits: ["PNG does not recreate detail lost in the original JPEG.", "The PNG file may be considerably larger than the JPG.", "Converting JPG to PNG does not create a transparent background automatically."],
    faq: [{ q: "Will JPG to PNG improve quality?", a: "No. It prevents a new lossy encode, but existing JPEG artifacts remain." }, { q: "Will the result have transparency?", a: "No. A normal JPG is opaque, so its PNG copy is opaque too." }, { q: "Do JPG and JPEG need separate converters?", a: "No. They are filename spellings for the same JPEG image format; this page accepts both." }],
    related: [{ label: "PNG to JPG", href: "/png-to-jpg" }, { label: "WebP to PNG", href: "/webp-to-png" }, { label: "Image converter", href: "/convert-screenshot" }],
  },
};

export const FORMAT_CONVERSION_LIST = Object.values(FORMAT_CONVERSIONS);
