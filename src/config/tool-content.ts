/**
 * What each tool page teaches a first-time visitor, below the working tool: what it does, how
 * it works, when to use it, privacy, formats and a few real questions. One entry per live tool,
 * written for that tool — nothing here is shared boilerplate. Claims must match what the tool
 * actually does; keep it short enough that the tool, not the copy, stays the page's focus.
 */
import type { ToolId } from "./tools";

export interface ToolContent {
  /** Hint under the uploader. */
  dropHint: string;
  /** H2 for the overview, in natural words ("What Smart Stitch does"). */
  whatHeading: string;
  /** 2–4 sentences. */
  intro: string;
  steps: { title: string; body: string }[];
  useCases: { title: string; body: string }[];
  privacy: string;
  /** Only formats the tool really produces. */
  outputs: string[];
  faq: { q: string; a: string }[];
  /** Built-in workflows that use this tool, linked from the page. */
  workflows?: string[];
}

export const TOOL_CONTENT: Record<ToolId, ToolContent> = {
  stitch: {
    dropHint: "or drag and drop two or more overlapping screenshots here",
    whatHeading: "What Smart Stitch does",
    intro: "Smart Stitch joins overlapping screenshots — a long chat, a web page or a settings screen captured in parts — into one tall image. It finds where each pair overlaps, avoids repeating fixed headers and tab bars when it can identify them, and shows how confident it is about every join so you can check it.",
    steps: [
      { title: "Add screenshots in scroll order", body: "Paste, drop or choose two or more captures, top to bottom. You can reorder them later." },
      { title: "Check each join", body: "Inspect the seam in normal, overlay or difference view. Drag it, nudge it with the arrow keys or type an exact position." },
      { title: "Export the full image", body: "The result is built from your original files. Very tall images are written in sections so the browser doesn’t run out of memory." },
    ],
    useCases: [
      { title: "A whole conversation", body: "Share a chat thread that’s longer than one screen as a single image." },
      { title: "A long page from a phone", body: "Capture an article, receipt or settings page where a full-page capture isn’t available." },
      { title: "One image for a report", body: "Turn several partial captures into one image for a PDF, ticket or bug report." },
    ],
    privacy: "Stitching runs in your browser. Your screenshots aren’t uploaded, and they’re cleared when you close the tab.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Do the screenshots need to overlap?", a: "Yes. Smart Stitch matches content that appears in both screenshots. If they don’t overlap, use Combine to stack them instead." },
      { q: "Why aren’t fixed headers repeated?", a: "When Shotexa can tell that a bar stays in place while you scroll — an app header, a tab bar, a chat input — it leaves out the repeated copies. Check the seam when a join is marked for review." },
      { q: "What if a join is wrong?", a: "Use Adjust manually to drag the seam, nudge it with the arrow keys or type a position. Undo and redo work for every change." },
    ],
  },
  combine: {
    dropHint: "or drag and drop two or more screenshots to arrange them in one image",
    whatHeading: "What Combine does",
    intro: "Combine places two or more screenshots in one image — stacked, side by side or in a grid. You set the spacing, alignment, sizing and background, and screenshots are scaled evenly so they’re never stretched. Unlike Smart Stitch, it doesn’t look for overlap: each screenshot stays whole.",
    steps: [
      { title: "Add your screenshots", body: "Paste, drop or choose them, or use results from another Shotexa tool." },
      { title: "Choose a layout", body: "Vertical stack, horizontal row or grid. Reorder the files whenever you need to." },
      { title: "Fine-tune and download", body: "Adjust spacing, alignment, sizing and the background, then export one image." },
    ],
    useCases: [
      { title: "Before and after", body: "Put two versions of a screen next to each other for a review or a changelog." },
      { title: "A flow, step by step", body: "Stack the screens of a sign-up or checkout flow in order." },
      { title: "A set of app screens", body: "Lay several screens out in a grid for a portfolio or a store listing draft." },
    ],
    privacy: "Combining and exporting run in your browser; your screenshots aren’t uploaded.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Will my screenshots be stretched?", a: "No. Match width and match height scale each screenshot uniformly, so its proportions stay intact." },
      { q: "What’s the difference from Smart Stitch?", a: "Smart Stitch removes the overlap between scrolling captures to make one continuous image. Combine keeps every screenshot whole and simply arranges them." },
      { q: "Can I use screenshots of different sizes?", a: "Yes. Choose whether to match their widths or heights, or keep their original sizes and align them." },
    ],
  },
  beautify: {
    dropHint: "or drag and drop a screenshot to put it on a background or in a frame",
    whatHeading: "What the Beautifier does",
    intro: "The Beautifier turns a plain screenshot into a presentable image. Place it on a solid, gradient or blurred background, inside a generic browser window or phone frame, add shadows and 3D perspective, and size the result for where you’re posting it. Up to three screenshots can share one composition.",
    steps: [
      { title: "Add a screenshot", body: "Paste, drop or choose an image — or open a result from another Shotexa tool." },
      { title: "Start from a style", body: "Pick a preset such as SaaS Hero, Documentation or App Showcase, then adjust anything you like." },
      { title: "Adjust the details", body: "Background, frame, padding, corners, shadow, perspective, captions and an optional logo." },
      { title: "Set the size and export", body: "Keep it automatic, choose a ratio, or use a fixed size for X, LinkedIn, YouTube, Open Graph or Product Hunt. Export at 1× to 4×." },
    ],
    useCases: [
      { title: "Launch and social posts", body: "Make a feature screenshot stand out in a feed at the right dimensions." },
      { title: "Docs and help articles", body: "Add a subtle frame and background so screenshots read as part of the page." },
      { title: "App and landing-page visuals", body: "Show a mobile screen in a phone frame with depth and a soft shadow." },
      { title: "Side-by-side compositions", body: "Place two or three screenshots together, side by side, stacked or overlapping." },
    ],
    privacy: "The composition is drawn in your browser from your original pixels. Nothing is uploaded, and the browser frame’s address bar only shows a URL if you type one.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Is my screenshot stretched to fit a frame?", a: "Never. It keeps its proportions. In the phone frame you choose whether to fill the screen, which trims the edges, or fit the whole screenshot." },
      { q: "Are these real browser or phone designs?", a: "No. The frames are generic shapes drawn by Shotexa. They carry no company’s logo and don’t copy a particular device." },
      { q: "Can I use more than one screenshot?", a: "Yes. Add up to two more screenshots and choose a layout such as side by side, stacked, fanned or overlapping." },
      { q: "Which sizes are available?", a: "Automatic, common ratios such as 1:1, 4:5 and 16:9, a custom size, and fixed sizes for X, LinkedIn, YouTube thumbnails, Open Graph images and Product Hunt." },
    ],
    workflows: ["product-screenshot"],
  },
  compare: {
    dropHint: "or drag and drop two screenshots to compare them",
    whatHeading: "What Compare does",
    intro: "Compare shows what changed between two screenshots. View them side by side, with a before/after slider, as an overlay, or as a measured difference that highlights changed pixels. Shotexa can line the two up automatically, group changes into regions you can step through, compare the visible text, and ignore areas that change on their own.",
    steps: [
      { title: "Add two screenshots", body: "The first is Before and the second is After. A result from another Shotexa tool can be compared with its original." },
      { title: "Line them up", body: "Automatic alignment measures a small offset and, optionally, a scale difference. You can adjust or turn it off." },
      { title: "Review what changed", body: "Choose a pixel or perceptual measurement, see changed regions and a heatmap, and mark areas such as clocks or banners as ignored." },
      { title: "Export a view or a report", body: "Save the current view as an image, or a comparison report as PDF, a ZIP package or a JSON summary." },
    ],
    useCases: [
      { title: "Visual QA before a release", body: "Check a page or app screen for unintended changes between two builds." },
      { title: "Design against the build", body: "Compare a design export with a screenshot of what was implemented." },
      { title: "What changed in a document", body: "Spot edits between two versions of a dashboard, form or statement." },
    ],
    privacy: "Alignment, measurement, text comparison and reports are produced in your browser; neither screenshot is uploaded. Comparing text downloads OCR language data the first time.",
    outputs: ["PNG, JPEG or WebP comparison image", "PDF report", "ZIP report package", "JSON summary"],
    faq: [
      { q: "Can I compare screenshots of different sizes?", a: "Yes. Both are fitted into one shared frame and neither is stretched. Shotexa tells you exactly how the two files differ in width, height, aspect ratio and format." },
      { q: "What does Difference measure?", a: "Where pixels differ and by how much — either a plain per-channel comparison, or CIE76 delta-E in CIELAB, a colour-science formula that ignores more rendering noise. A region is only labelled added, removed, moved or a text change when the measurement supports it." },
      { q: "How does automatic alignment work?", a: "Small greyscale copies of the screenshots are matched to measure one offset and, optionally, one uniform scale. The numbers are shown so you can check them. If no reliable match is found, Shotexa says so and compares them unaligned." },
      { q: "Is any of this AI?", a: "No. Every number comes from a fixed formula over the pixels or from OCR output. Shotexa never writes a description of what it thinks changed." },
    ],
    workflows: ["visual-qa-report"],
  },
  "safe-share": {
    dropHint: "or drag and drop a PNG, JPEG or WebP screenshot here",
    whatHeading: "What Privacy Guard does",
    intro: "Privacy Guard helps you hide private details before you share a screenshot. It reads the visible text on your device and suggests likely emails, phone numbers, card and bank numbers, API keys, tokens and IP addresses — plus QR codes and barcodes where your browser can detect them. You review every suggestion, add your own boxes, and export a flattened copy with image metadata removed.",
    steps: [
      { title: "Add a screenshot", body: "Paste, drop or choose the image you want to share." },
      { title: "Scan on your device", body: "Pick a preset — Developer, Customer Support, Finance, Social Sharing or Maximum — and Shotexa looks for likely sensitive details." },
      { title: "Review every finding", body: "Select, ignore or adjust each suggestion. Low-confidence findings are marked as such, never treated as certain." },
      { title: "Redact and export", body: "Use Blackout, Blur or Pixelate, draw your own boxes, then export a flattened copy with metadata removed. Shotexa checks the exported copy afterwards." },
    ],
    useCases: [
      { title: "Sending a screenshot to support", body: "Hide account numbers, emails and addresses before attaching it to a ticket." },
      { title: "Posting a bug publicly", body: "Cover API keys, tokens and internal IP addresses before it goes in an issue tracker." },
      { title: "Sharing billing or account screens", body: "Remove card details and personal information before sending them to a colleague." },
    ],
    privacy: "Scanning, redaction, metadata cleaning and the final check all run in your browser. The scan uses on-device text recognition, which downloads its language data the first time; your screenshot is never sent with it.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Will it find every sensitive detail?", a: "No tool can promise that. Detection looks for known patterns and context in the text Shotexa can read; unusual formats, small or blurry text and details inside pictures can be missed. Look over the image before you share it." },
      { q: "Are Blur and Pixelate permanent?", a: "They make an area hard to read, but Blackout is the mode designed to replace the selected pixels completely. Use Blackout for passwords, keys and financial details." },
      { q: "Can I undo a redaction?", a: "Yes. Redactions stay editable until you export, and undo and redo work for every change. Your original screenshot is never modified." },
      { q: "What is removed besides the redacted areas?", a: "The exported copy has image metadata such as location, device and software details removed, and Shotexa verifies the result before you download it." },
    ],
    workflows: ["safe-share", "bug-report"],
  },
  blur: {
    dropHint: "or drag and drop a PNG, JPEG or WebP screenshot here",
    whatHeading: "What Blur Screenshot does",
    intro: "Blur Screenshot obscures the parts of an image you choose. Draw rectangles over what should be hidden and set each one to Blur, Pixelate or Blackout. On export, the effects are flattened into a new copy and image metadata is removed.",
    steps: [
      { title: "Add a screenshot", body: "Paste, drop or choose an image, or continue from another Shotexa tool." },
      { title: "Draw the regions", body: "Drag a rectangle over each area. Move or resize any region afterwards." },
      { title: "Choose the effect", body: "Blur or Pixelate to soften an area, or Blackout to replace it completely." },
      { title: "Export a flattened copy", body: "The effects are burned into a new image and metadata is removed. The original stays unchanged." },
    ],
    useCases: [
      { title: "Tidy a demo screenshot", body: "Soften notifications, names or unrelated tabs that distract from the point." },
      { title: "Presentations and slides", body: "Obscure customer names or figures that shouldn’t appear on screen." },
      { title: "Social posts", body: "Pixelate usernames and faces in a screenshot of a conversation." },
    ],
    privacy: "Editing, flattening and export run in your browser; nothing is uploaded.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Is blurring enough to hide passwords or card numbers?", a: "Not reliably. Blur and Pixelate make text hard to read, but Blackout is the mode designed to remove it. Use Blackout for anything that must stay secret." },
      { q: "Can Shotexa find sensitive text for me?", a: "Yes — Privacy Guard scans the screenshot for likely emails, keys, card numbers and more, then lets you review each suggestion." },
      { q: "Can I change a region after drawing it?", a: "Yes. Regions stay editable until you export, with undo and redo for every change." },
    ],
    workflows: ["safe-share"],
  },
  "extract-text": {
    dropHint: "or drag and drop a PNG, JPEG or WebP screenshot here",
    whatHeading: "What Screenshot to Text does",
    intro: "Screenshot to Text reads the text in a screenshot and gives it back to you as editable text. Recognition (OCR) runs on your device in a browser worker, so you can copy an error message, a quote or a list of settings without retyping it.",
    steps: [
      { title: "Add a screenshot", body: "If several are in the workspace, Shotexa reads the selected one." },
      { title: "Choose the language", body: "English by default, or English + Hindi. The extra language data loads only if you choose it." },
      { title: "Extract and review", body: "Correct any mistakes in the result, then copy it or download a TXT file." },
    ],
    useCases: [
      { title: "Error messages and logs", body: "Copy the exact text of an error from a screenshot into a search or a ticket." },
      { title: "Slides and posts", body: "Pull the text out of a slide, a social post or an image someone sent you." },
      { title: "Settings and configuration", body: "Get the values from a settings screen into a document without retyping them." },
    ],
    privacy: "OCR runs in your browser. The first run downloads the English language data (and Hindi, if you choose it); your screenshot and the extracted text stay on your device.",
    outputs: ["Copy to clipboard", "TXT file"],
    faq: [
      { q: "Why are some words wrong?", a: "OCR is less reliable on small, blurry or low-contrast text, decorative fonts and complex layouts. Capturing the text larger, or cropping to it first, usually helps." },
      { q: "Which languages are supported?", a: "English, and English + Hindi. The Hindi model loads only after you select it and start extraction." },
      { q: "Can I keep a table’s rows and columns?", a: "Screenshot to Text returns plain text. Use Screenshot to Data to rebuild tables and export CSV, XLSX or JSON." },
    ],
    workflows: ["bug-report", "documentation-pack"],
  },
  "structured-data": {
    dropHint: "or drag and drop one or more PNG, JPEG or WebP screenshots here",
    whatHeading: "What Screenshot to Data does",
    intro: "Screenshot to Data turns a screenshot of a table, form, code block or document into structured, editable data. It reads the text on your device and uses where each word sits to rebuild rows and columns, label–value pairs or code, then lets you correct every value before you export.",
    steps: [
      { title: "Add a screenshot", body: "Use the whole image, or draw a region around one table, form or code block." },
      { title: "Pick the structure", body: "Auto Detect chooses table, key/value, code, document or plain text from the layout — or choose it yourself." },
      { title: "Review and edit", body: "Correct cells and values in the editor. Cells Shotexa is unsure about are flagged." },
      { title: "Export", body: "Download CSV, TSV, XLSX, JSON, Markdown or plain text. Several tables can go into one ZIP or a multi-sheet XLSX." },
    ],
    useCases: [
      { title: "Tables you can only screenshot", body: "Get figures out of a dashboard, report or PDF viewer into a spreadsheet." },
      { title: "Forms and receipts", body: "Turn label–value pairs into JSON or CSV you can paste somewhere else." },
      { title: "Code in screenshots", body: "Recover a snippet from a tutorial, slide or chat message." },
    ],
    privacy: "Extraction and every export happen in your browser. Text recognition downloads its language data the first time; screenshots and extracted data aren’t uploaded.",
    outputs: ["CSV", "TSV", "XLSX", "JSON", "Markdown", "TXT"],
    faq: [
      { q: "How is this different from Screenshot to Text?", a: "Screenshot to Text gives you plain text. Screenshot to Data keeps the layout — rows, columns and fields — so the result opens correctly in a spreadsheet or code." },
      { q: "How accurate are the tables?", a: "Rows and columns are inferred from alignment, so merged cells, rotated text or very dense tables may need corrections. Uncertain cells are flagged for review." },
      { q: "Are numbers converted in JSON?", a: "Only if you turn on “Infer numbers and booleans”. Otherwise every value is kept exactly as text." },
    ],
  },
  pdf: {
    dropHint: "or drag and drop PNG, JPEG or WebP screenshots here",
    whatHeading: "What Screenshot to PDF does",
    intro: "Screenshot to PDF turns one or more screenshots into a PDF. Long screenshots are spread across pages, and Smart Pagination moves each page break to nearby whitespace so it doesn’t cut through a line of text or a card. Every break stays editable.",
    steps: [
      { title: "Add screenshots", body: "Add one or more, in the order the pages should appear." },
      { title: "Choose the page size", body: "A4, Letter, or Fit to keep each screenshot on a page of its own size." },
      { title: "Review the breaks", body: "Breaks Smart Pagination is unsure about are flagged. Drag or nudge any break." },
      { title: "Create the PDF", body: "The PDF is built locally and stays in your workspace until you download it." },
    ],
    useCases: [
      { title: "Long chats and pages", body: "Send a long conversation or web page as a document that’s easy to read and print." },
      { title: "Receipts and confirmations", body: "Keep booking or payment screenshots together in one file." },
      { title: "One file for a client or ticket", body: "Combine several screenshots into a single attachment." },
    ],
    privacy: "Pagination and PDF creation happen in your browser. This tool doesn’t run OCR, and nothing is uploaded.",
    outputs: ["PDF"],
    faq: [
      { q: "What does Smart Pagination change?", a: "It looks near each expected page boundary for whitespace and separators, and moves the cut there when that avoids splitting content." },
      { q: "Can I select the text in the PDF?", a: "No — the pages are images. Use Searchable PDF to add a text layer you can search and copy." },
      { q: "Can I combine several screenshots?", a: "Yes. Reorder them in the Files panel and Shotexa places their pages in that order." },
    ],
    workflows: ["documentation-pack"],
  },
  "searchable-pdf": {
    dropHint: "or drag and drop PNG, JPEG or WebP screenshots here",
    whatHeading: "What Searchable PDF does",
    intro: "Searchable PDF keeps each screenshot exactly as it looks and places an invisible text layer on top, so the text can be searched, selected and copied in any PDF reader. The text comes from OCR run on your device, and pages use the same smart page breaks as Screenshot to PDF.",
    steps: [
      { title: "Add screenshots", body: "Results from Smart Stitch or Privacy Guard carry over without another upload." },
      { title: "Recognise the text", body: "Existing OCR results are reused; otherwise Shotexa reads the text in English or English + Hindi." },
      { title: "Review the pages", body: "Check the smart page breaks and adjust any that are flagged." },
      { title: "Export the PDF", body: "Each screenshot is the visible page, with the text layer placed over it." },
    ],
    useCases: [
      { title: "Find it later", body: "Make a long screenshot searchable with your PDF reader’s find command." },
      { title: "Archive documents", body: "Keep statements or letters you only have as screenshots in a searchable form." },
      { title: "Let others quote it", body: "Share material people need to copy text from." },
    ],
    privacy: "OCR, page planning, font embedding and PDF creation all run in your browser. The first OCR run downloads language data; your screenshots and their text stay on your device.",
    outputs: ["PDF with a searchable text layer"],
    faq: [
      { q: "Does it change how my screenshot looks?", a: "No. The screenshot is the visible page; the text layer is invisible." },
      { q: "How accurate is the search?", a: "As accurate as the OCR. Small or blurry text can be misread, which affects search and copy but never the visible page." },
      { q: "Is text I edited in Screenshot to Text used?", a: "No. The layer uses the original OCR words and their positions, so it lines up with the page. Edited text is still available to copy or save as TXT." },
    ],
  },
  editor: {
    dropHint: "or drag and drop a screenshot to crop, rotate or resize it",
    whatHeading: "What the Screenshot Editor does",
    intro: "The Screenshot Editor crops, resizes, rotates and flips a screenshot at full resolution. Edits are kept as instructions until you export, so every change can be undone and your original file is never altered.",
    steps: [
      { title: "Add a screenshot", body: "Paste, drop or choose an image, or open a result from another Shotexa tool." },
      { title: "Crop and transform", body: "Drag the crop box or type exact values, then rotate, flip or resize." },
      { title: "Export", body: "The result is rendered from your original file and saved as a new image." },
    ],
    useCases: [
      { title: "Trim to what matters", body: "Cut away browser chrome, sidebars or other windows." },
      { title: "Exact sizes", body: "Resize to the width a document, CMS or app store asks for." },
      { title: "Fix orientation", body: "Rotate a sideways phone screenshot or flip a mirrored capture." },
    ],
    privacy: "All editing and export runs in your browser; nothing is uploaded.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Will editing change my original screenshot?", a: "No. Exporting creates a new image; the original stays exactly as it was." },
      { q: "Does resizing lose quality?", a: "Making an image smaller keeps it sharp. Making it larger adds pixels but not detail, and Shotexa tells you when that happens." },
      { q: "Which formats can I export?", a: "PNG (the lossless default), JPEG and WebP. Very tall results, such as long stitched screenshots, are saved as PNG." },
    ],
    workflows: ["web-ready"],
  },
  annotate: {
    dropHint: "or drag and drop a screenshot to add arrows, text and highlights",
    whatHeading: "What Annotate does",
    intro: "Annotate lets you point things out on a screenshot with arrows, boxes, highlights, text, freehand drawing and numbered steps. Every mark stays editable until you export, and the final image is drawn at the screenshot’s full resolution so text stays sharp.",
    steps: [
      { title: "Add a screenshot", body: "Paste, drop or choose an image, or open a result from another Shotexa tool." },
      { title: "Mark it up", body: "Choose a tool and draw. Select any mark to move, resize, recolour or delete it." },
      { title: "Export", body: "Your marks are drawn onto a new copy; the original stays untouched." },
    ],
    useCases: [
      { title: "Bug reports", body: "Circle the broken element and number the steps that lead to it." },
      { title: "How-to guides", body: "Show where to click with arrows and numbered callouts." },
      { title: "Design feedback", body: "Highlight spacing, colour or copy issues directly on the screen." },
    ],
    privacy: "Annotation and export run in your browser; nothing is uploaded.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Can I change an annotation after adding it?", a: "Yes. Select it to move, resize, restyle or delete it. Undo and redo work for every change." },
      { q: "How do numbered steps work?", a: "Each new marker takes the next number. Deleting one never silently renumbers the rest; use Renumber when you want 1, 2, 3 again." },
      { q: "Will text be sharp in the exported image?", a: "Yes. Annotations are drawn at the screenshot’s full resolution, not scaled up from the preview." },
    ],
    workflows: ["bug-report", "documentation-pack"],
  },
  split: {
    dropHint: "or drag and drop a long screenshot to cut it into several images",
    whatHeading: "What Split does",
    intro: "Split cuts a long screenshot into several images — into equal parts, every set number of pixels, or at lines you place yourself. The pieces meet exactly at each line, so nothing is lost or repeated.",
    steps: [
      { title: "Add a long screenshot", body: "Or open a Smart Stitch, Combine or edited result without uploading it again." },
      { title: "Choose where to cut", body: "Equal sections, a fixed height, or your own lines. Drag, add and remove lines; every change can be undone." },
      { title: "Export the pieces", body: "Each piece is cut from the original at full resolution. Download them individually or all at once." },
    ],
    useCases: [
      { title: "Platforms with height limits", body: "Post a long capture as several images or a carousel." },
      { title: "Slides and documents", body: "Turn one long page into pieces that fit a slide or page." },
      { title: "Readable parts", body: "Break a stitched conversation into sections that are easier to read on a phone." },
    ],
    privacy: "Splitting and export happen in your browser; nothing is uploaded.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Will any part of my screenshot be lost?", a: "No. Every row of the original appears in exactly one piece." },
      { q: "Can I choose where each cut goes?", a: "Yes. Start from an equal split and drag any line, or switch to Custom and click to place your own." },
      { q: "Which formats can the pieces be saved in?", a: "PNG (the lossless default), JPEG and WebP. Very tall pieces are saved as PNG." },
    ],
  },
  compress: {
    dropHint: "or drag and drop a screenshot to make it smaller",
    whatHeading: "What Compress does",
    intro: "Compress makes a screenshot file smaller without changing its width or height. Keep the format or switch to JPEG or WebP, set a quality or a target file size, and see the exact new size before you download.",
    steps: [
      { title: "Add a screenshot", body: "PNG, JPEG or WebP — or a result from another Shotexa tool." },
      { title: "Choose format and quality", body: "Set a quality, or pick a target size and let Shotexa find a quality that fits." },
      { title: "Compare and download", body: "See the original and new sizes side by side before you save the file." },
    ],
    useCases: [
      { title: "Attachment limits", body: "Get a screenshot under the size limit for email, chat or a support form." },
      { title: "Faster pages", body: "Smaller images load faster in docs, blogs and help centres." },
      { title: "Storage and sharing", body: "Keep large screenshots light without resizing them." },
    ],
    privacy: "Encoding happens in your browser; your screenshot isn’t uploaded.",
    outputs: ["JPEG", "WebP", "PNG"],
    faq: [
      { q: "How much smaller will it get?", a: "It depends on the image. Shotexa shows the exact new size and the percentage saved before you download — and says so if a setting would make the file larger." },
      { q: "What’s the trade-off with lower quality?", a: "Smaller files, but text edges can soften and blocky artefacts can appear around sharp lines. Text-heavy screenshots usually look best as WebP or high-quality JPEG." },
      { q: "Why is there no quality setting for PNG?", a: "PNG is lossless — it keeps every pixel exactly. For a much smaller file, choose WebP or JPEG." },
      { q: "Does compressing change the dimensions?", a: "No. Width and height stay the same; only the file gets smaller." },
    ],
    workflows: ["web-ready"],
  },
  convert: {
    dropHint: "or drag and drop a screenshot to convert it",
    whatHeading: "What Convert does",
    intro: "Convert changes a screenshot between PNG, JPEG and WebP at exactly the same pixel size. Choose a quality for JPEG and WebP, and a background colour for transparent areas when converting to JPEG.",
    steps: [
      { title: "Add a screenshot", body: "PNG, JPEG or WebP — or a result from another Shotexa tool." },
      { title: "Choose the format", body: "Set the quality for JPEG and WebP, and a background for transparent images going to JPEG." },
      { title: "Download", body: "The converted file has the same dimensions; your original is unchanged." },
    ],
    useCases: [
      { title: "A site that only takes JPEG", body: "Convert a PNG for an upload form that rejects other formats." },
      { title: "Lighter web images", body: "Convert to WebP for smaller files at similar quality." },
      { title: "Lossless copies", body: "Convert to PNG when every pixel of a text-heavy screenshot must stay exact." },
    ],
    privacy: "Conversion happens in your browser; nothing is uploaded.",
    outputs: ["PNG", "JPEG", "WebP"],
    faq: [
      { q: "Which format should I choose?", a: "PNG keeps every pixel and transparency — best for text-heavy screenshots. WebP is usually much smaller at good quality. JPEG is the most widely accepted but can’t store transparency." },
      { q: "What happens to transparent areas in JPEG?", a: "They’re filled with the background you choose — white by default, or black, cream or any custom colour." },
      { q: "Will converting change the dimensions?", a: "No. WebP holds at most 16,383 px per side, so very long screenshots can be converted to PNG or JPEG, or split first." },
    ],
  },
  metadata: {
    dropHint: "or drag and drop a JPEG, PNG or WebP image here",
    whatHeading: "What Remove Image Metadata does",
    intro: "Remove Image Metadata strips hidden information from JPEG, PNG and WebP files — GPS location, camera and device details, editing software, comments and embedded thumbnails — without re-encoding the image. Colour profiles needed to display it correctly are kept, and the cleaned file is checked again before you download it.",
    steps: [
      { title: "Inspect", body: "Shotexa reads the file and lists the privacy-sensitive metadata it contains." },
      { title: "Clean", body: "GPS, private EXIF and device details, XMP, comments, software identifiers and hidden thumbnails are removed." },
      { title: "Verify and download", body: "The cleaned file is read again to confirm the metadata is gone and the image is intact." },
    ],
    useCases: [
      { title: "Before posting publicly", body: "Photos from a phone can include the exact place they were taken." },
      { title: "Sending files outside your organisation", body: "Remove device names, software and author details." },
      { title: "Selling online", body: "Strip location data from listing photos taken at home." },
    ],
    privacy: "The file is read and rewritten in your browser; it isn’t uploaded.",
    outputs: ["Same format as the original (JPEG, PNG or WebP)"],
    faq: [
      { q: "Does it change the pixels?", a: "No. Only the metadata in the file’s container is rewritten; the image data is not decoded or recompressed." },
      { q: "Will colour profiles be removed?", a: "No. ICC profiles and required colour information are kept because they affect how the image looks." },
      { q: "What if the file is already clean?", a: "Shotexa tells you no privacy-sensitive metadata was found and gives you the original file unchanged." },
    ],
    workflows: ["web-ready", "safe-share"],
  },
  "remove-background": {
    dropHint: "or drag and drop an image to remove its background locally",
    whatHeading: "What Remove Background does",
    intro: "Remove Background separates the main subject of an image from its background, using a small segmentation model that runs in your browser. Refine the edges with restore and erase brushes, keep the result transparent, or place the subject on a new background.",
    steps: [
      { title: "Add an image", body: "PNG, JPEG or WebP. The original file is never changed." },
      { title: "Remove the background", body: "The model runs on your device. The first use downloads it once." },
      { title: "Refine the mask", body: "View the mask, then restore or erase areas with a brush and adjust edge smoothing." },
      { title: "Replace or keep transparent", body: "Keep transparency, or choose a solid colour, a gradient, a blurred copy of the original or your own image." },
      { title: "Export", body: "PNG and WebP keep transparency. JPEG is available once you choose a visible background." },
    ],
    useCases: [
      { title: "Product photos", body: "Put a product on a clean, consistent background for a listing." },
      { title: "Profile pictures", body: "Cut yourself out of a busy photo and choose a simple backdrop." },
      { title: "Launch graphics", body: "Isolate a subject, then style it in the Beautifier." },
    ],
    privacy: "The model and all image processing run in your browser. The first use downloads a versioned model file; your image is never sent with that request. There’s no generative fill — Shotexa only keeps or removes existing pixels.",
    outputs: ["PNG (transparent)", "WebP (transparent)", "JPEG (with a background)"],
    faq: [
      { q: "Does Shotexa upload my image?", a: "No. Only the model file is downloaded, once; your image stays on your device." },
      { q: "Can I restore part of the removed background?", a: "Yes. Use the restore brush to bring back areas the model removed, or the erase brush to remove more." },
      { q: "Can I export a transparent PNG?", a: "Yes. PNG and WebP keep transparency; trim the empty space around the subject if you like." },
      { q: "Does it work on phones?", a: "Yes, in current mobile browsers. It takes longer than on a computer, and very large images can need more memory than some phones have." },
    ],
    workflows: ["product-screenshot"],
  },
  batch: {
    dropHint: "or drag and drop several screenshots to process them together",
    whatHeading: "What Batch does",
    intro: "Batch applies one operation to many images: compress, convert, resize, remove privacy metadata or remove backgrounds. Images are processed one at a time at full resolution, and the results download together as a ZIP.",
    steps: [
      { title: "Add your images", body: "Up to 50 PNG, JPEG or WebP files. Results from other Shotexa tools can be included." },
      { title: "Choose one operation", body: "Pick the operation and its settings once for the whole batch." },
      { title: "Process", body: "Files run one after another; a file that fails doesn’t stop the rest and can be retried." },
      { title: "Download the ZIP", body: "Successful results are packaged together on your device." },
    ],
    useCases: [
      { title: "Shrink a folder of screenshots", body: "Compress them before uploading to a docs site or help centre." },
      { title: "Convert a set", body: "Turn a batch of PNGs into WebP or JPEG in one go." },
      { title: "Clean or cut out many photos", body: "Strip metadata from, or remove backgrounds on, a set of product photos." },
    ],
    privacy: "Processing and ZIP creation happen in your browser. Background removal downloads its model the first time; your images aren’t uploaded.",
    outputs: ["ZIP of PNG, JPEG or WebP files"],
    faq: [
      { q: "Why one file at a time?", a: "A decoded image uses far more memory than its file size. Processing sequentially is safer on phones and Safari." },
      { q: "What happens if one image fails?", a: "The others carry on. The failed file is left out of the ZIP and can be retried after changing the settings." },
      { q: "Which operations are available?", a: "Compress, Convert, Resize, Privacy Clean (metadata removal) and Remove Background. Redaction, OCR and annotation work on one screenshot at a time in their own tools." },
    ],
  },
};
