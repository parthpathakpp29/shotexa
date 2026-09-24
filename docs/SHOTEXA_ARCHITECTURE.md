# SHOTEXA — MASTER PRODUCT & ENGINEERING SOURCE OF TRUTH

You are the lead engineer building **Shotexa**.

Treat this document as the source of truth for the product. The product name, positioning, core capabilities, SEO strategy, URL architecture, major UX decisions, processing architecture, and V1 scope have already been researched and decided.

Do **not** restart product ideation, rename the product, redesign the SEO strategy, split it into unrelated mini-apps, add unnecessary SaaS infrastructure, or replace the architecture because you personally prefer another stack.

If you encounter a genuine technical limitation, explain the limitation and propose the smallest architecture-compatible adjustment.

---

# 1. PRODUCT

## Name

**Shotexa**

Primary domain:

**shotexa.com**

## Product category

Shotexa is a **browser-based screenshot toolbox**.

It is not a generic file converter, generic image editor, PDF suite, Canva competitor, cloud storage service, collaboration SaaS, or AI wrapper.

The product should become:

> **The screenshot-specific toolbox that does difficult screenshot jobs unusually well.**

## Core positioning

Primary positioning:

> **Everything you need for screenshots — private, fast, and in your browser.**

Product philosophy:

> **Smart when useful. Manual when necessary. Private by design.**

Architecture principle:

> **Original file once; derived operations many times.**

Core UX promise:

> **Paste/upload once → continue between screenshot tools without uploading again.**

---

# 2. WHY SHOTEXA EXISTS

Most screenshot utilities solve one small action and force the user to repeatedly upload/download files across separate websites.

Shotexa should instead feel like **one connected screenshot application**.

A user might enter through Google at:

`/stitch-screenshots`

perform a stitch, then continue directly to:

`/redact-screenshot`

then:

`/annotate-screenshot`

then:

`/screenshot-to-pdf`

without re-uploading the screenshot.

Externally:

> Individual SEO-friendly tools.

Internally:

> One persistent screenshot workspace.

---

# 3. BUSINESS MODEL / PRODUCT RULES

V1 is:

- Free
- No account
- No signup
- No watermark
- Browser/local processing wherever technically possible
- SEO-driven acquisition
- Ads may be considered later

Do not introduce artificial usage limits unless required by real browser/device memory constraints.

Do not claim “unlimited” processing.

Future monetization may involve advertising, but ads must never interfere with core upload/edit/download interactions.

---

# 4. WHAT DIFFERENTIATES SHOTEXA

Privacy alone is not enough because other browser tools already advertise local processing.

Shotexa's differentiation has four layers.

## 4.1 Smart Screenshot Stitching

Automatically detect overlapping screenshots and create one continuous long screenshot.

When confidence is insufficient, provide an excellent manual correction interface.

## 4.2 Safe Share

A privacy workflow containing:

- Blur
- Pixelate
- Solid destructive Blackout
- Metadata cleaning

Secure redaction must actually alter exported pixels.

## 4.3 Smart Screenshot → PDF

Do not blindly cut long screenshots at page boundaries.

Try to place breaks around whitespace/content boundaries and let users manually adjust every break.

## 4.4 Connected Workflow

After every operation offer relevant:

**Continue with…**

actions.

Example:

Stitch  
→ Redact  
→ Annotate  
→ Extract Text  
→ Make PDF  
→ Compress

---

# 5. LOCKED V1 CAPABILITIES

These capabilities are already decided.

Do not remove them because individual search volume appears small.

## 1. Smart Screenshot Stitcher

Automatically join overlapping screenshots.

Must support:

- auto overlap detection
- confidence scoring
- manual correction
- reorder
- repeated header/status bar handling where practical
- full-resolution output
- graceful failure

## 2. Combine Screenshots

Combine screenshots:

- vertically
- horizontally
- optionally grid layout

Include:

- reorder
- spacing
- alignment
- background options

If uploaded images appear to overlap, suggest:

> **These screenshots appear to overlap. Smart Stitch them instead?**

## 3. Screenshot Editor

Support:

- crop
- resize
- rotate
- flip

## 4. Blur & Redact

Three distinct modes:

- Blur
- Pixelate
- Blackout

Blackout is the secure redaction mode.

Exports must flatten destructive redactions into final pixels.

## 5. Screenshot → PDF

Support:

- one image
- multiple images
- reorder
- A4
- Letter
- Fit
- margins
- image quality
- smart pagination
- manual page break adjustment

## 6. Smart PDF Pagination

Try to avoid cutting:

- text
- messages
- paragraphs
- visually dense content

User must always be able to manually adjust page boundaries.

## 7. Annotate Screenshot

Support:

- arrows
- rectangles
- highlights
- text
- freehand drawing
- numbered steps

## 8. Screenshot → Text / OCR

Support:

- paste
- upload
- text extraction
- editable recognised text
- copy
- TXT export
- language selection
- OCR bounding/layout data needed for searchable PDF

## 9. Split Long Screenshot

Split a very long screenshot into multiple images.

## 10. Compress Screenshot

Reduce image size.

Potentially support quality/target-size controls later.

## 11. Convert Screenshot

Common formats only:

- PNG
- JPEG/JPG
- WebP

This capability exists in the application but generic conversion keywords are NOT an initial SEO priority.

## 12. Searchable PDF

Visible screenshot image + OCR-based invisible/selectable text layer.

## 13. Screenshot Beautifier

Support:

- backgrounds
- padding
- rounded corners
- shadows

## 14. Device / Browser Frames

Support screenshot presentation inside:

- browser frame
- phone frame
- desktop-style frame

## 15. Compare Screenshots

Support:

- side-by-side
- slider
- visual difference/highlight mode

## 16. Batch Processing + ZIP

Allow users to process multiple screenshots and download outputs together.

## 17. Metadata Removal / Privacy Clean

This is also required.

Inspect and remove privacy-sensitive metadata while avoiding unnecessary recompression where practical.

---

# 6. DO NOT BUILD THESE YET

Do not add these to V1 unless explicitly requested later:

- accounts
- authentication
- user profiles
- cloud storage
- saved projects in the cloud
- public share links
- team collaboration
- screen recording
- video tools
- browser screenshot-capture extension
- screenshot-to-code
- AI chat
- generic PDF suite
- generic image converter suite
- HEIC
- TIFF
- RAW
- PSD
- editable SVG
- dozens of obscure formats
- 100+ shallow SEO pages
- server-side screenshot processing
- unnecessary APIs
- automatic face/private-data detection as a launch blocker

AI/private-data detection can be considered after launch.

---

# 7. V1 INFRASTRUCTURE — IMPORTANT

V1 does **NOT** need:

- Supabase
- PostgreSQL
- MongoDB
- Redis
- S3
- Express
- FastAPI
- authentication
- cloud file storage
- screenshot upload endpoint
- screenshot processing API

Screenshot content should remain in the browser.

Next.js server rendering/static generation is fine for webpage/SEO content.

There should simply be no V1 endpoint such as:

`/api/upload`

that receives user screenshots.

---

# 8. LOCKED TECH STACK

Use:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Lucide icons
- Zustand
- Canvas API
- OffscreenCanvas where supported
- Web Workers
- OpenCV.js
- Tesseract.js initially
- pdf-lib
- client-zip
- Vitest
- Playwright
- Vercel

OCR MUST sit behind an abstraction so Tesseract can later be replaced or supplemented by PP-OCR/PaddleOCR or another browser OCR engine.

Do not scatter vendor APIs throughout React components.

---

# 9. ROUTE ARCHITECTURE

Very important:

The homepage and tool routes must share the same persistent workspace provider.

Use a route-group architecture conceptually similar to:

```text
src/app/

├── layout.tsx

├── (workspace)/
│   ├── layout.tsx
│   ├── page.tsx
│   │
│   ├── blur-screenshot/
│   ├── stitch-screenshots/
│   ├── screenshot-to-text/
│   ├── screenshot-to-pdf/
│   ├── combine-screenshots/
│   ├── redact-screenshot/
│   ├── remove-image-metadata/
│   └── ...
│
├── tools/
├── privacy/
├── how-local-processing-works/
├── privacy-check/
├── browser-support/
├── changelog/
├── about/
├── contact/
└── terms/
```

The `(workspace)/layout.tsx` owns the persistent browser workspace.

This means:

Homepage paste/upload  
→ client navigate to Stitch  
→ Redact  
→ PDF

without losing the user's current files.

Hard refresh may reset workspace content in V1.

That is acceptable.

Do NOT persist screenshots silently.

Optional local restoration using IndexedDB can be considered later.

---

# 10. SEO STRATEGY

Shotexa has already completed keyword/SERP research.

Do not create a new page for every keyword synonym.

Rule:

> **One genuinely different search intent/workflow = one indexable page.**

Do NOT create:

```text
/merge-screenshots
/join-screenshots
/screenshot-combiner
/screenshot-merger
```

when `/combine-screenshots` already satisfies that intent.

Do NOT create:

```text
/screenshot-ocr
/extract-text-from-screenshot
/copy-text-from-screenshot
```

as duplicate tools when `/screenshot-to-text` covers that intent.

Do NOT create:

```text
/convert-screenshot-to-pdf
/save-screenshot-as-pdf
/turn-screenshot-into-pdf
```

when `/screenshot-to-pdf` covers that intent.

---

# 11. P0 SEO ROUTES

These are launch-priority pages.

## `/blur-screenshot`

Primary keyword:

**blur screenshot**

Secondary:

- blur screenshot online
- how to blur screenshot
- blur messages on screenshot
- blur part of screenshot

Title:

**Blur Screenshot Online – Free & Private | Shotexa**

H1:

**Blur a Screenshot Online**

---

## `/stitch-screenshots`

Primary keyword:

**stitch screenshots**

Secondary:

- screenshot stitcher
- screenshot stitcher online
- stitch screenshot
- stitch screenshots together

Title:

**Stitch Screenshots Online – Smart Screenshot Stitcher | Shotexa**

H1:

**Smart Screenshot Stitcher**

---

## `/screenshot-to-text`

Primary keyword:

**screenshot to text**

Secondary:

- screenshot OCR
- OCR screenshot
- extract text from screenshot
- copy text from screenshot
- screenshot to text converter

Title:

**Screenshot to Text – Free Private OCR | Shotexa**

H1:

**Convert Screenshot to Text**

---

## `/screenshot-to-pdf`

Primary keyword:

**screenshot to PDF**

Secondary:

- convert screenshot to PDF
- turn screenshot into PDF
- save screenshot as PDF
- screenshots to PDF
- screenshot to PDF converter
- combine screenshots into one PDF

Title:

**Screenshot to PDF – Free & Private Converter | Shotexa**

H1:

**Convert Screenshots to PDF**

This is one of Shotexa's largest long-term SEO opportunities even though the head keyword is competitive.

---

## `/combine-screenshots`

Primary keyword:

**combine screenshots**

Secondary:

- merge screenshots
- join screenshots
- screenshot combiner
- screenshot merger
- combine screenshots into one image

Title:

**Combine Screenshots Online – Merge Into One Image | Shotexa**

H1:

**Combine Screenshots Into One Image**

---

## `/remove-image-metadata`

Primary keyword:

**remove image metadata**

Secondary:

- remove metadata from image
- image metadata remover
- remove EXIF data
- remove GPS metadata

Title:

**Remove Image Metadata – Free EXIF & GPS Remover | Shotexa**

H1:

**Remove Metadata From Images**

---

## `/redact-screenshot`

Primary keyword:

**redact screenshot**

Secondary:

- how to redact a screenshot
- hide sensitive information in screenshot
- black out screenshot text

Title:

**Redact Screenshot Online – Hide Sensitive Information | Shotexa**

H1:

**Redact Sensitive Information From a Screenshot**

---

# 12. P1 SEO ROUTES

Create after/around P0 implementation as their actual tools become production-quality.

```text
/screenshot-to-searchable-pdf
/split-long-screenshot
/annotate-screenshot
/screenshot-editor
/compare-screenshots
/screenshot-beautifier
/compress-screenshot
```

Titles/H1:

### `/screenshot-to-searchable-pdf`

Title:
**Screenshot to Searchable PDF – OCR PDF Converter | Shotexa**

H1:
**Convert Screenshots to Searchable PDFs**

### `/split-long-screenshot`

Title:
**Split Long Screenshot Online – Free & Private | Shotexa**

H1:
**Split a Long Screenshot**

### `/annotate-screenshot`

Title:
**Annotate Screenshot Online – Arrows, Text & Highlights | Shotexa**

H1:
**Annotate a Screenshot Online**

### `/screenshot-editor`

Title:
**Screenshot Editor Online – Crop, Resize & Rotate | Shotexa**

H1:
**Edit a Screenshot Online**

### `/compare-screenshots`

Title:
**Compare Screenshots Online – Side-by-Side & Difference | Shotexa**

H1:
**Compare Two Screenshots**

### `/screenshot-beautifier`

Title:
**Screenshot Beautifier – Add Backgrounds & Frames | Shotexa**

H1:
**Beautify a Screenshot**

### `/compress-screenshot`

Title:
**Compress Screenshot Online – Reduce Image Size | Shotexa**

H1:
**Compress a Screenshot**

---

# 13. NON-TOOL ROUTES

Required supporting pages:

```text
/
/tools
/privacy
/how-local-processing-works
/privacy-check
/browser-support
/changelog
/about
/contact
/terms
```

`/tools` must link to all genuine tools.

---

# 14. HOMEPAGE UX

Homepage title:

**Shotexa – Free Private Screenshot Tools Online**

Homepage H1:

**Everything You Need for Screenshots**

Above the fold should approximately be:

```text
SHOTEXA                      Tools   Stitch   OCR   PDF   Privacy

Everything you need for screenshots.

Stitch screenshots, hide sensitive information,
extract text, create PDFs and more — directly in your browser.

┌─────────────────────────────────────────────────────────┐
│                                                         │
│                  Paste a screenshot                      │
│                                                         │
│             Ctrl/⌘ + V anywhere on page                  │
│                                                         │
│                 or drop images here                      │
│                                                         │
│                [ Choose screenshots ]                    │
│                                                         │
└─────────────────────────────────────────────────────────┘

Files stay on your device · No sign-up · No watermark

Explore all tools      Try Smart Stitching →
```

Important:

Do not create a fake “Paste” button that unexpectedly requests clipboard access.

Listen for normal paste events.

Primary clickable action:

**Choose screenshots**

If user pastes/uploads on homepage, open the generic Shotexa workspace and present contextual actions.

For one screenshot:

- Blur
- Redact
- Extract Text
- PDF
- Edit
- Annotate

For multiple screenshots additionally offer:

- Combine
- Smart Stitch

If overlap appears likely:

> **These screenshots may belong together. Smart Stitch them instead?**

---

# 15. HOMEPAGE BELOW HERO

Suggested order:

1. Popular Tools
2. Smart. Controllable. Private.
3. One Screenshot, Many Actions
4. How Local Processing Works
5. Short FAQ
6. Footer

Popular tools:

- Smart Stitch
- Blur
- OCR
- PDF
- Combine

Do not bury the actual tool behind long marketing copy.

---

# 16. TOOL PAGE TEMPLATE

Every SEO tool page follows the same general skeleton, while its text/tool controls remain unique.

```text
Breadcrumb

H1

One short sentence explaining exactly what this tool does.

ACTUAL TOOL / WORKSPACE
Paste · Drop · Choose

Files stay on your device
No sign-up
No watermark

How it works
3 concise steps

Feature-specific explanation

Privacy note

3–5 genuine FAQs

Related tools
crawlable links
```

The interactive workspace is a Client Component.

The surrounding:

- H1
- description
- SEO text
- FAQ
- internal links

should remain server-rendered/static where practical.

No generic 2,000-word SEO filler.

---

# 17. INTERNAL LINKING

Use real:

```tsx
<Link href="/redact-screenshot">
```

or crawlable `<a href>` links.

Do not make all navigation JavaScript-only.

Every successful operation should offer relevant:

**Continue with…**

actions.

Example:

```text
✓ Screenshot stitched

[Download]

Continue with:

Redact
Annotate
Extract text
Make PDF
Compress
```

---

# 18. NAVIGATION

Desktop header:

```text
Shotexa

Tools ▼
Stitch
OCR
PDF
Privacy

                                   [Choose screenshots]
```

Tool dropdown taxonomy:

## Create

- Stitch Screenshots
- Combine Screenshots
- Split Long Screenshot

## Text & Documents

- Screenshot to Text
- Screenshot to PDF
- Searchable PDF

## Protect

- Blur Screenshot
- Redact Screenshot
- Remove Metadata

## Edit

- Screenshot Editor
- Annotate Screenshot

## Present & Compare

- Screenshot Beautifier
- Compare Screenshots
- Compress Screenshot

Do not put 14 tool names directly into the header.

Mobile navigation should use a compact drawer/sheet.

---

# 19. WORKSPACE — DESKTOP

General desktop layout:

```text
┌────────────┬────────────────────────────────┬──────────────┐
│ FILES      │                                │ SETTINGS     │
│            │                                │              │
│ Image 1    │             CANVAS             │ Controls     │
│ Image 2    │                                │              │
│ Image 3    │                                │              │
│            │                                │              │
├────────────┴────────────────────────────────┴──────────────┤
│ Undo   Redo   Zoom                            Export       │
└────────────────────────────────────────────────────────────┘
```

Left:

Asset/file tray.

Center:

Preview/canvas.

Right:

Contextual inspector/tool controls.

Bottom/top toolbar:

- Undo
- Redo
- Zoom
- Fit
- Export

---

# 20. WORKSPACE — MOBILE

Do not try to copy the desktop 3-column layout.

Use:

```text
Tool name

Preview / canvas

Tool controls
Bottom sheet / panel

Undo     Redo     Export
```

Controls must be touch-friendly.

Aim for ~44×44px primary interactive targets.

---

# 21. STATE ARCHITECTURE

Use Zustand only for lightweight logical application state.

Examples:

```ts
type FileId = string;
type AssetId = string;
type JobId = string;
```

Zustand may hold:

```text
active tool
file metadata
file order
selection
active file
operations
undo history
redo history
jobs
progress
export settings
source route
```

DO NOT store:

```text
full decoded pixel buffers
large ImageData
huge Blobs
full raster undo snapshots
```

inside Zustand.

---

# 22. ASSET REGISTRY

Large resources should live outside Zustand in a dedicated runtime object.

Conceptually:

```ts
class AssetRegistry {
  // Blob
  // ImageBitmap
  // thumbnail URL
  // output Blob
}
```

The Workspace runtime should conceptually own:

```text
WorkspaceRuntime
├── Zustand store
├── AssetRegistry
├── WorkerBroker
└── CapabilityManager
```

Prefer creating this runtime through the persistent WorkspaceProvider rather than a random global singleton.

---

# 23. UNDO / REDO

Use operation/command history.

Example:

```ts
{
  type: "ADD_REDACTION",
  targetId: "asset_1",
  rect: {
    x: 120,
    y: 300,
    width: 420,
    height: 80
  },
  mode: "blackout"
}
```

Undo removes the operation.

Use this approach for:

- crop
- rotate
- resize
- annotations
- redactions
- reorder
- stitch seam adjustments
- PDF page breaks
- backgrounds
- frames

Start with a configurable history budget around ~50 meaningful operations.

Do not make 50 a permanent hard-coded architectural limit.

---

# 24. WORKER ARCHITECTURE

Use dependency-specific workers.

```text
UI
 ↓
Worker Broker
 ├── Image Worker
 ├── Vision Worker
 ├── OCR Worker
 └── Document Worker
```

## Image Worker

Handles:

- thumbnails
- resize
- crop
- rotate
- compositing
- ordinary raster processing
- Canvas / OffscreenCanvas

## Vision Worker

Lazy-loads OpenCV.

Handles:

- stitching analysis
- overlap detection
- screenshot comparison

## OCR Worker

Owns:

- Tesseract
- OCR WASM
- language models
- OCR preprocessing

Reuse OCR worker across multiple recognitions rather than constructing a new worker for every screenshot.

## Document Worker

Lazy-loads:

- pdf-lib
- client-zip

Handles:

- PDF generation
- searchable PDF
- batch/ZIP output

---

# 25. WORKER PROTOCOL

Use one typed contract.

Conceptually:

```ts
interface WorkerEnvelope {
  version: 1;
  jobId: string;
}
```

Requests:

```text
RUN
CANCEL
```

Responses:

```text
PROGRESS
SUCCESS
ERROR
CANCELLED
```

Errors should contain controlled codes.

Cancellation should be cooperative.

Workers should release temporary:

- ImageBitmap
- OpenCV Mat
- Canvas resources

when finished/cancelled.

Hard worker termination is only a fallback for a stuck worker.

---

# 26. ENGINE ABSTRACTIONS

React components should use abstractions like:

```ts
imageEngine.resize()
stitchEngine.analyse()
ocrEngine.recognise()
pdfEngine.create()
metadataEngine.clean()
```

Do not spread:

```ts
cv.matchTemplate()
Tesseract.createWorker()
PDFDocument.create()
```

through UI files.

Required logical engines:

```text
image-core
vision-engine
ocr-engine
pdf-engine
redaction-engine
metadata-engine
annotation-engine
batch-engine
archive-engine
export-engine
```

---

# 27. SUPPORTED V1 FORMATS

Image input:

- PNG
- JPEG/JPG
- WebP
- clipboard browser images

Image output:

- PNG
- JPEG
- WebP

Document:

- PDF

OCR:

- TXT
- clipboard text

Batch:

- ZIP

Do not support initially:

- HEIC
- TIFF
- RAW
- PSD
- SVG editing

---

# 28. SMART STITCHING ENGINE

This is the flagship technical feature.

Treat it as one of the highest engineering priorities.

Exploit the fact that screenshots typically:

- have similar dimensions
- have the same scale
- move mostly vertically
- contain an overlapping region

Pipeline:

```text
Screenshots
↓
Validate orientation/dimensions
↓
Generate downscaled greyscale proxies
↓
Search likely overlap zone
↓
Template matching
↓
Validate match
↓
If ambiguous:
feature-based fallback
↓
Estimate dominant translation
↓
Validate seam
↓
Confidence score
↓
High → Auto stitch
Medium → Stitch + Review
Low → Manual seam editor
↓
Full-resolution output
```

Use OpenCV template matching as the fast path.

Search primarily:

bottom region of Screenshot A

against

top region of Screenshot B.

Do not initially run expensive whole-image panorama algorithms.

---

# 29. STITCHING CONFIDENCE

Confidence may consider:

- template similarity
- uniqueness of best match
- geometric consistency
- seam pixel residual
- expected screenshot geometry

Any initial numeric weightings/thresholds are experimental.

Keep them in configuration.

Do not treat them as permanent constants.

Tune them using the Shotexa screenshot benchmark.

---

# 30. REPEATED HEADERS / FOOTERS

Chats/apps may repeat:

- status bar
- fixed header
- bottom navigation

Naive matching can incorrectly stitch these.

Attempt to identify highly repeated rows/regions and reduce their importance during overlap matching.

---

# 31. MANUAL STITCH EDITOR

If confidence is insufficient, user must always have a correction path.

Support:

- vertical dragging
- zoom
- overlay mode
- difference mode
- normal mode
- one-pixel keyboard adjustment
- larger Shift+Arrow adjustment
- reorder/swap
- reset to automatic suggestion
- confidence indicator

Never communicate confidence only using color.

Example:

> Confidence: 61% — please review this join.

Minimum launch-quality Smart Stitch:

**automatic overlap matching + confidence + manual vertical correction**

---

# 32. OCR

Initial OCR:

**Tesseract.js**

But it MUST be behind:

```ts
interface OcrEngine
```

so we can later benchmark/replace with another browser OCR engine.

Pipeline:

```text
Screenshot
↓
OCR-only preprocessing
↓
OCR worker
↓
Text + layout boxes
↓
Reading order
↓
Editable result
↓
Copy / TXT / Searchable PDF
```

OCR preprocessing may include:

- orientation correction
- grayscale
- contrast adjustment
- upscaling tiny text

These transformations must be non-destructive.

The original screenshot stays unchanged.

Do not apply every preprocessing step blindly.

Benchmark them.

---

# 33. OCR RESULT MODEL

Conceptually:

```ts
interface OcrResult {
  rawText: string;
  blocks: OcrBlock[];
  editedText: string;
  language: string;
  confidence?: number;
}
```

Important:

Keep original OCR layout/bounding information separate from user-edited text.

Searchable PDF positioning should use OCR layout/word boxes.

User-edited text is primarily for:

- copy
- TXT
- correction

unless proper layout remapping is implemented.

---

# 34. SEARCHABLE PDF

Searchable PDF consists of:

```text
visible screenshot image
+
invisible/selectable OCR text layer
```

Translate OCR image coordinates into PDF page coordinates.

Test output compatibility with common PDF viewers, including at minimum:

- Chrome PDF viewer
- Adobe Acrobat
- macOS Preview

---

# 35. REDACTION / SAFE SHARE

Treat these modes differently:

## Blur

Visual obscuring.

Not guaranteed secure redaction.

## Pixelate

Stronger visual obscuring.

Still should not be marketed as cryptographically/forensically secure.

## Blackout

Permanent redaction.

This is the default mode for `/redact-screenshot`.

Editing is non-destructive so Undo works.

Export is destructive.

Export pipeline:

```text
Original
↓
Render fresh export canvas
↓
Apply transformations
↓
Apply redactions directly to pixels
↓
Flatten
↓
Scrub privacy metadata
↓
Encode output
```

Never export original hidden pixels behind an overlay.

---

# 36. REMOVE IMAGE METADATA

Do not simply re-encode every image through Canvas if the only requested action is metadata removal.

Where practical, use format-aware/container-level metadata cleaning.

Default mode:

**Privacy Clean**

Remove privacy-sensitive data such as:

- EXIF
- XMP
- GPS
- author/comments/software text
- privacy-relevant timestamps

Preserve where appropriate:

- pixel data
- alpha
- required format data
- color profiles/color-space metadata

Do not blindly delete all PNG ancillary chunks.

For JPEG/WebP, preserve compressed image/color information where practical while stripping privacy metadata.

After cleaning, verify the output using the metadata parser.

Metadata UI should first show the user what was found.

Example:

```text
Metadata found

✓ EXIF
✓ GPS
✓ Software
✓ XMP

[Remove privacy metadata]
```

Container parsers must use strict bounds checking.

Prefer mature/tested parsing solutions where appropriate.

If custom binary parsing is required, fuzz-test it.

---

# 37. SMART PDF

Normal PDF conversion is not enough.

Smart pagination is an important Shotexa differentiator.

Calculate the ideal page boundary based on:

- paper size
- orientation
- margins
- image scale

Then inspect a nearby window for a better break.

Signals may include:

- text intersection
- edge density
- ink density
- whitespace
- separators
- distance from mathematically ideal break

If OCR already exists, heavily penalize cuts through OCR text lines.

Do NOT require OCR just to make ordinary PDF pagination work.

Use visual heuristics when OCR isn't loaded.

Automatic breaks must always remain editable.

---

# 38. PDF BREAK EDITOR

User must be able to:

- drag page break
- adjust with arrows
- Shift+Arrow larger adjustment
- snap to suggested safe location
- add break
- delete break
- reset automatic breaks
- preview page numbers
- optionally add small overlap

Do not allow smart pagination to create absurdly short pages.

Any initial 10–12% maximum-adjustment number should remain configurable and benchmark-driven.

Render PDF pages independently rather than first constructing one enormous canvas.

---

# 39. COMBINE SCREENSHOTS

Support:

- vertical
- horizontal
- grid
- reorder
- spacing
- alignment
- backgrounds

If uploaded screenshots likely overlap:

> **These screenshots appear to overlap. Smart Stitch them instead?**

Combine is deliberately simpler than Smart Stitch.

Do not merge their meanings.

---

# 40. MEMORY POLICY

This is critical.

Encoded file size does not equal decoded processing size.

A 1080×20,000 RGBA screenshot alone can require roughly 82 MiB decoded.

Therefore:

1. Keep originals encoded as Blobs.
2. Generate small thumbnails.
3. Decode full resolution only when needed.
4. Perform stitch detection on downscaled proxies first.
5. Initially allow one heavy vision/OCR/document job at a time.
6. Close ImageBitmap resources.
7. Delete OpenCV Mats.
8. Revoke unused object URLs.
9. Avoid `toDataURL()` for huge images.
10. Never store raster undo snapshots.

Use approximately **192 MiB as an initial soft working-set budget**, NOT a claimed browser limit.

Tune it through real device testing.

If projected processing is unsafe:

```text
try reduced proxy / sequential processing

then offer:

PDF
Split images
ZIP sections
Reduce dimensions
```

For extremely tall images, do not assume one giant browser Canvas will always work.

---

# 41. PROCESSING FALLBACK

Capability-detect.

Preferred:

```text
OffscreenCanvas + Worker
```

Fallback:

```text
Worker + bounded Canvas path
```

Then:

```text
bounded main-thread Canvas
```

only when reasonably safe.

If memory/size remains unsafe:

- reduced resolution
- alternative output
- clear recoverable error

The UI should fail gracefully instead of freezing/crashing.

---

# 42. PRIVACY RULES

Privacy is an architecture requirement.

Never send these through analytics/logging:

- screenshot bytes
- filenames
- OCR text
- image metadata values
- image hashes
- pixel data
- object URLs
- redaction coordinates
- extracted private information

Do not encode screenshot data in URLs.

Bad examples:

```text
?ocrText=
?filename=
?imageHash=
```

Tool route URLs represent the tool only.

---

# 43. PRIVACY COPY

Correct:

> **Your screenshot files stay on your device.**

Avoid misleading claims like:

> Shotexa makes zero network requests.

The site will still load:

- JavaScript
- WASM
- OCR models
- analytics assets

Privacy means screenshot contents are not uploaded for processing.

---

# 44. `/privacy-check`

Build a page:

`/privacy-check`

H1:

**Verify That Shotexa Keeps Your Screenshots on Your Device**

Explain how to use Browser DevTools → Network to verify screenshot contents are not uploaded.

Provide an optional harmless sample screenshot.

This is an important trust differentiator.

---

# 45. SECURITY

Validate input using:

```text
file extension
+
declared MIME
+
magic/file signature
```

Do not support SVG input initially.

Use sensible security headers including:

- Content-Security-Policy
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- anti-framing/frame-ancestors protection

Do not introduce complex nonce/dynamic-rendering architecture unnecessarily if it damages static SEO performance.

Do not enable SharedArrayBuffer/COOP/COEP merely because WASM threading exists.

Only consider that after profiling demonstrates meaningful benefit.

---

# 46. ANALYTICS

Useful privacy-safe events:

```text
tool_viewed
file_added
processing_started
processing_completed
processing_failed
stitch_confidence
manual_fallback_opened
continue_with_clicked
undo_used
redo_used
export_started
export_completed
memory_fallback
```

Allowed properties should remain coarse.

Examples:

```text
tool
source: paste/drop/picker
count_bucket
mode
duration_bucket
high/medium/low confidence
format
coarse pixel bucket
```

Never send raw third-party error strings.

Map errors to controlled values such as:

```text
UNSUPPORTED_FORMAT
DECODE_FAILED
MEMORY_PRESSURE
STITCH_NO_MATCH
OCR_FAILED
PDF_EXPORT_FAILED
```

---

# 47. ACCESSIBILITY

Target WCAG 2.2 AA.

Main interactive targets should aim for ~44×44 CSS px.

Keyboard:

```text
Ctrl/Cmd + V           Paste
Ctrl/Cmd + Z           Undo
Ctrl/Cmd + Shift + Z   Redo
Arrow                  precise adjustment
Shift + Arrow          larger adjustment
Tab                    navigation
Enter / Space          activate
Escape                 cancel
```

Never make drag the only interaction.

Examples:

Drag file reorder:
also provide Move Up / Move Down.

Drag PDF break:
also provide keyboard adjustment.

Drag stitch seam:
also provide numeric/keyboard controls.

Canvas-selected objects should expose accessible DOM/inspector controls.

Processing progress should be announced using ARIA live regions.

---

# 48. PERFORMANCE

Do not eagerly load every processing dependency.

Homepage before user intent should load:

OpenCV: **0 bytes**

Tesseract/model: **0 bytes**

pdf-lib: **0 bytes**

client-zip: **0 bytes**

Lazy load when the relevant tool is actually used.

Heavy processing must happen outside the main UI thread.

Aim for good Core Web Vitals.

SEO pages should remain fast even though advanced tools eventually use WASM.

---

# 49. SEO TECHNICAL RULES

Every indexable page should have:

- unique title
- unique H1
- unique description/content
- self-referencing canonical
- crawlable internal links

Canonical example:

```text
https://shotexa.com/stitch-screenshots
```

Do not create canonical variants from workspace query strings.

Use:

- sitemap.ts
- robots.ts
- static route metadata where appropriate
- Open Graph metadata/assets

Use structured data conservatively.

Potentially appropriate when truthful:

- WebApplication / SoftwareApplication
- BreadcrumbList
- FAQPage where displayed and useful

Never invent:

- reviews
- ratings
- usage counts
- fake awards

---

# 50. PREVIEW DEPLOYMENTS

Vercel Preview deployments must be:

`noindex, nofollow`

Production alone should expose normal canonical Shotexa URLs.

---

# 51. DESIGN / UI PRINCIPLES

The exact brand color system can be refined during implementation, but the product must feel:

- clean
- modern
- fast
- focused
- trustworthy
- distinct from iLovePDF/TinyWow clones

Do not copy another converter site's visual identity.

Prioritize:

- strong typography
- generous whitespace
- clear hierarchy
- obvious tool state
- excellent drag/drop
- visible progress
- accessible focus states
- excellent mobile behavior
- minimal visual clutter

Do not delay V1 for an elaborate dark-mode system.

If theming is implemented, keep it simple and system-aware.

---

# 52. FUTURE ADS

Design layouts so future advertising can be added safely.

Ads must NEVER appear:

- inside upload zones
- beside the main Download button
- inside tool controls
- beside destructive redaction actions
- inside mobile tool bottom sheets
- between closely spaced action buttons

Future safe areas include:

- below tool output
- between informational content sections
- below FAQs
- outside the active desktop editor area

Do not implement ads now unless explicitly requested.

---

# 53. PWA

Make architecture PWA-ready.

Initial:

- manifest
- icons
- stable processing asset URLs
- self-hosted WASM/model strategy

Do not block core launch on full offline support.

Later:

- service worker
- app shell caching
- processing library caching
- OCR model caching
- Share Target if browser support makes it worthwhile

---

# 54. TESTING

Use Vitest for deterministic/core logic.

Examples:

- state reducers
- operation history
- coordinate transforms
- stitch confidence
- PDF break scoring
- metadata parsing
- filename generation
- worker protocols
- error mapping

Use Playwright for real user flows.

Critical flows:

```text
paste → blur → export

multiple uploads → reorder → combine

multiple uploads → auto stitch → manual correction

paste → OCR → copy text

long screenshot → smart PDF → move break → export

redact → continue with PDF

batch → ZIP
```

Test:

- Chromium
- Firefox
- WebKit

Also manually test physical/real environments:

- iPhone Safari
- iPad Safari
- Android Chrome
- low-memory Android device
- macOS Safari
- Windows Chrome/Edge

---

# 55. SCREENSHOT TEST FIXTURES

Create and maintain a benchmark set covering:

- WhatsApp/chat
- dark mode
- web article
- table
- code
- repeated header
- repeated footer
- tiny overlap
- large overlap
- unequal widths
- low contrast
- very long screenshots

Stitching tests should know expected overlap/seam ranges.

Test both:

- actual alignment
- confidence classification

---

# 56. REDACTION TESTS

For redaction output:

```text
export
↓
reopen exported file
↓
inspect redacted pixels
↓
confirm hidden original pixels aren't present
↓
parse metadata
↓
confirm privacy metadata removed
```

This is a launch-critical test.

---

# 57. TECHNICAL SPIKES — DO THESE BEFORE POLISHING THE FULL UI

This is important.

Before spending large effort on final design, prove the five riskiest technical assumptions.

## Spike A — Smart Stitching

Build a standalone prototype.

Test:

- template matching
- low-res proxy
- coordinate mapping
- confidence
- manual seam correction

Use real screenshots.

## Spike B — Large-Image Memory

Test long screenshots on:

- Chrome desktop
- Safari
- iPhone
- Android

Determine safe canvas/bitmap behavior.

## Spike C — OCR

Benchmark Tesseract on:

- chats
- dark mode
- small text
- code
- receipts
- mixed layout
- English
- Hindi if relevant

Keep engine swappable.

## Spike D — Smart PDF Pagination

Prototype:

- whitespace scoring
- edge/ink scoring
- manual break adjustment

Test chats/articles/code/tables.

## Spike E — Metadata Sanitization

Prototype:

- JPEG
- PNG
- WebP

Verify metadata removal without unnecessary image degradation.

Do not polish these spikes into final UX.

Use them to validate architecture.

---

# 58. DEVELOPMENT ORDER

Engineering order is intentionally different from SEO ranking priority.

## Phase 0 — Technical Spikes

Complete the five experiments above.

Document results.

Update only configurable implementation assumptions.

Do not change the product itself unless a true technical blocker exists.

---

## Phase 1 — Foundation

Build:

- Next.js project
- App Router
- TypeScript
- Tailwind
- shadcn
- `(workspace)` persistent layout
- WorkspaceProvider
- Zustand lightweight state
- AssetRegistry
- WorkerBroker
- site navigation
- footer
- P0/P1 placeholder routes
- metadata system
- sitemap
- robots
- canonical strategy
- basic security headers
- Vercel deployment
- CI

---

## Phase 2 — Image Core / Shared Workspace

Build:

- paste
- drop
- file picker
- validation
- thumbnail generation
- file tray
- reorder
- remove
- zoom
- pan/fit
- Canvas abstraction
- OffscreenCanvas capability detection
- Image Worker
- undo/redo operation model
- crop
- rotate
- resize
- basic PNG/JPEG/WebP export
- basic Combine

Everything after this should reuse these primitives.

---

## Phase 3 — Privacy / Safe Share

Build:

- blur
- pixelate
- blackout
- operation editing
- destructive flattened export
- metadata inspection
- metadata removal
- privacy verification
- `/blur-screenshot`
- `/redact-screenshot`
- `/remove-image-metadata`

---

## Phase 4 — Smart Stitch

Build:

- overlap matching
- low-res analysis
- confidence
- manual seam editor
- high-resolution composition
- reorder
- failure/recovery UX
- `/stitch-screenshots`

Then harden:

- repeated headers
- repeated footers
- difficult cases
- width mismatch
- memory fallbacks
- difference view
- feature-based fallback if validated

---

## Phase 5 — OCR

Build:

- OCR adapter
- lazy OCR worker
- Tesseract
- language loading
- preprocessing
- text blocks
- editable result
- Copy
- TXT
- progress
- cancellation
- `/screenshot-to-text`

---

## Phase 6 — Smart PDF

Build:

- document worker
- normal PDF
- multi-image reorder
- A4
- Letter
- Fit
- margins
- smart pagination
- manual page-break editor
- page-by-page processing
- `/screenshot-to-pdf`

---

## Phase 7 — Searchable PDF + Annotation

Build:

- OCR text layer
- `/screenshot-to-searchable-pdf`
- annotation
- arrows
- shapes
- highlights
- text
- drawing
- numbered steps
- `/annotate-screenshot`
- split long screenshot

---

## Phase 8 — Remaining Locked Utilities

Build:

- beautifier
- backgrounds
- shadows
- padding
- browser/device frames
- comparison
- difference mode
- compression
- conversion
- batch processing
- ZIP

---

## Phase 9 — Launch Hardening

Finish:

- mobile UX
- accessibility
- memory testing
- browser testing
- performance
- lazy loading
- privacy audit
- analytics safety
- SEO copy
- internal links
- FAQs
- sitemap
- canonical verification
- Search Console setup
- browser support documentation
- final compatibility matrix

---

# 59. DEFINITION OF DONE

Shotexa is NOT production-ready merely because every button exists.

V1 is ready when:

- user can paste immediately
- uploads stay local
- files survive client navigation between tools
- user does not need to re-upload when switching tools
- meaningful edits support Undo
- Smart Stitch has manual correction
- Smart Stitch does not silently reduce quality
- redactions are permanently flattened
- metadata removal can verify its result
- OCR works locally
- Smart PDF avoids obviously bad breaks
- every PDF break can be manually adjusted
- heavy operations do not freeze the main UI
- memory pressure fails gracefully
- P0 routes expose real functioning tools above SEO content
- P0 pages have unique titles/H1/content
- navigation uses crawlable links
- important drag operations have keyboard/button alternatives
- desktop and mobile work well
- Chrome/Firefox/WebKit tested
- real iOS/Android testing performed
- network inspection confirms screenshot pixels/OCR text are not uploaded

---

# 60. CODING AGENT WORKING RULES

When you begin:

1. Inspect the existing repository first.
2. Do not assume the project is empty.
3. Preserve useful existing code.
4. Compare existing structure to this source of truth.
5. Identify conflicts.
6. Fix architecture before duplicating features.
7. Work phase-by-phase.
8. Keep engine APIs separate from UI.
9. Keep processing local.
10. Keep large image resources out of Zustand.
11. Keep heavy dependencies lazy-loaded.
12. Add tests alongside core algorithms.
13. Do not silently expand scope.
14. Do not invent duplicate SEO routes.
15. Do not add backend infrastructure “just in case.”
16. Do not add authentication.
17. Do not prematurely optimize obscure formats.
18. Prefer reusable primitives over 14 duplicated tool implementations.

Before implementing a major processing engine, define:

- interface
- input model
- output model
- error model
- worker operation
- cancellation behavior
- memory cleanup behavior
- tests

---

# 61. EXPECTED CODE ORGANIZATION

Use something broadly like:

```text
src/
├── app/
│   ├── layout.tsx
│   │
│   ├── (workspace)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── blur-screenshot/
│   │   ├── stitch-screenshots/
│   │   ├── screenshot-to-text/
│   │   ├── screenshot-to-pdf/
│   │   ├── combine-screenshots/
│   │   ├── redact-screenshot/
│   │   ├── remove-image-metadata/
│   │   └── ...
│   │
│   ├── tools/
│   ├── privacy/
│   ├── how-local-processing-works/
│   ├── privacy-check/
│   ├── browser-support/
│   ├── changelog/
│   ├── about/
│   ├── contact/
│   └── terms/
│
├── components/
│   ├── workspace/
│   ├── upload/
│   ├── editor/
│   ├── inspector/
│   ├── toolbar/
│   ├── export/
│   ├── navigation/
│   └── seo/
│
├── core/
│   ├── runtime/
│   ├── assets/
│   ├── image/
│   ├── stitch/
│   ├── ocr/
│   ├── pdf/
│   ├── redaction/
│   ├── metadata/
│   ├── annotation/
│   ├── compare/
│   ├── beautify/
│   ├── batch/
│   ├── archive/
│   └── export/
│
├── workers/
│   ├── broker/
│   ├── image.worker.ts
│   ├── vision.worker.ts
│   ├── ocr.worker.ts
│   └── document.worker.ts
│
├── stores/
│   └── workspace-store.ts
│
├── config/
│   ├── tools.ts
│   ├── routes.ts
│   ├── seo.ts
│   ├── processing.ts
│   └── limits.ts
│
├── types/
│
└── tests/
    ├── fixtures/
    ├── unit/
    ├── integration/
    └── e2e/
```

This is a guideline, not permission to create needless folder complexity.

Keep modules cohesive.

---

# 62. FINAL PRODUCT MENTAL MODEL

Always remember what we are building:

```text
Google / Direct visitor
        ↓
SEO-specific Shotexa route
        ↓
Shared Shotexa workspace
        ↓
Paste/upload ONCE
        ↓
Asset Registry
        ↓
Choose screenshot operation
        ↓
Local Worker Engine
        ↓
Preview
        ↓
Adjust manually when necessary
        ↓
Download
        OR
Continue with another Shotexa tool
```

Shotexa is:

> **Search-friendly individual screenshot tools on the outside.**

and

> **One powerful connected screenshot application on the inside.**

Do not lose this architecture while implementing individual pages.

---

# 63. YOUR FIRST TASK

Do NOT immediately attempt to build every tool.

Start by:

1. Auditing the current repository.
2. Creating a short `SHOTEXA_ARCHITECTURE.md` from this source of truth if one does not already exist.
3. Identifying any existing code that conflicts with the architecture.
4. Running the five technical spikes:
   - Smart Stitch
   - large-image memory
   - OCR
   - Smart PDF
   - metadata sanitation
5. Report the findings.
6. Then establish the shared `(workspace)` foundation.
7. Only after the shared core is stable should individual P0 pages be implemented.

When you make implementation decisions, optimize for:

**performance, privacy, correctness, reusable architecture, accessibility, SEO, and graceful manual fallbacks.**

Do not optimize for adding the greatest number of features fastest.

The goal is to make **Shotexa** an excellent screenshot product, not another shallow utility collection.