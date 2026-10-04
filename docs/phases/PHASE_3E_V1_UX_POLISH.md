# Phase 3E — Final V1 UX Polish & Interaction System

Date: 2026-10-04  
Branch: `phase-3e/v1-ux-polish`  
Base: committed `phase-3d/v1-wow-features` (`7548a72`)  
Status: implementation and automated validation complete; real-device checks remain manual  
Release actions: no commit, push, merge or deployment performed

## 1. UX audit

Phase 3E audited Editor, Annotate, Beautifier, Compare, Safe Share, Smart Stitch, Split, Combine, PDF, Searchable PDF, Batch, OCR and Convert. The audit focused on learning one interaction model, preserving active editing gestures, reducing repeated clicks and keeping the local-first memory model unchanged.

| Area | Result | Evidence or limitation |
| --- | --- | --- |
| Shared zoom/pan | Implemented in Editor, Annotate, Beautifier, Compare, Smart Stitch, Split and shared file previews | Fit, 100%, ±, pointer-centred wheel zoom, Space-pan, double-click Fit/100% and bounded pinch use one hook |
| Safe Share viewport | Existing tool-specific Fit/50%/100%/200% retained | Redaction drawing, moving, resizing, keyboard nudging and export parity pass; migration was deliberately not forced after this path was rejected by the workspace patch guard |
| Combine viewport | Existing fitted, scrollable preview retained | Combine is a non-editing bounded preview and its output/reorder suites pass; migration was not forced after the same guarded-path failure |
| Drag/drop | Implemented globally on tool workspaces and existing upload surfaces | Contextual overlay, file validation, nested-event protection, one-drop deduplication, picker and paste preserved |
| Reordering | Implemented through the shared File Tray | Native desktop drag handle, insertion indicator and touch/keyboard-safe Move up/down alternative update actual workspace order |
| History and shortcuts | Consistent where real history exists | Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y; no fake history added |
| Mobile sheets | Existing shared bottom sheet retained and verified | Radix focus management, scrolling, safe-area padding, 44 px actions and no 390 px horizontal overflow |
| Feedback | Improved | Replacing status toast for added/rejected files; specific processing text; existing copy, export, OCR, ZIP and verified-result statuses retained |

No new tool, route, backend, account, cloud storage or V2 capability was added.

## 2. Shared interaction model

The reusable viewport is split into pure math and a browser interaction hook:

- `src/core/viewport/viewport.ts` owns zoom limits, Fit/actual scale, zoom steps, pointer anchor math, pan clamping, keyboard guards and gesture ownership rules.
- `src/lib/use-viewport.ts` owns browser events and DOM scroll state.
- `src/components/ui/viewport.tsx` owns the consistent toolbar and visible `Fit`, `75%`, `100%` style label.

The model is:

- coarse mouse wheel and Ctrl-wheel/trackpad pinch zoom toward the pointer;
- small unmodified trackpad deltas remain native scrolling instead of being misread as zoom;
- `Space` + drag temporarily pans, except while focus is on an input, button, link, slider or other native interactive control;
- middle-button drag pans;
- preview-only surfaces may allow direct drag and one-finger pan;
- editing stages opt out of direct pan so crop, annotation, redaction, compare divider and split-line gestures win;
- two-touch gestures own pinch only while two touches are active;
- double-click toggles Fit/100% only on non-editable canvas space;
- `0` = Fit, `1` = 100%, `+`/`-` = zoom and `Esc` delegates to the tool's safe cancel/deselect action;
- zoom is clamped to 10%–800%.

Pointer-centred zoom converts the pointer from screen space into world/image space before scale changes, then corrects scroll after layout so that world point remains under the pointer. Wheel bursts are coalesced through `requestAnimationFrame`; zoom and pan do not re-encode a source image.

## 3. Features implemented

- Shared Fit/100%/zoom toolbar and interaction hook.
- Pointer-centred wheel zoom with bounded scale.
- Space/middle-button pan with `grab`/`grabbing` feedback.
- Pinch handling that prevents page scrolling only during an owned two-touch gesture.
- Global tool-workspace drag overlay with Compare, Stitch and Combine-specific instructions.
- Dropped-file identity deduplication and event propagation protection so one physical drop is not ingested twice.
- Desktop drag handles, insertion feedback and Move up/down alternatives in the shared File Tray.
- Concise Compare, Stitch and Batch empty states.
- Batch Select all, Clear selection, Select successful, Select failed and desktop Shift-range selection.
- Beautifier snap buttons with temporary non-exported centre/edge guides.
- Section resets for Beautifier background, border/shadow, text and position; Editor crop, rotation and adjustments; Compare analysis; Convert settings.
- Shared non-stacking file-ingest feedback with timer cleanup.
- More specific Beautifier high-resolution rendering status.
- Existing registry-driven Continue With, copy-image capability handling, cancellation, file facts, before/after, reduced-motion and error-message systems were preserved.

## 4. Tools using the shared viewport system

| Tool/surface | Direct drag pan | One-finger pan | Editing gesture priority |
| --- | ---: | ---: | --- |
| Editor | No | No | Crop box and handles win |
| Annotate | No | No | Draw, select, move, resize and text win |
| Beautifier | Yes | Yes | Preview-only surface |
| Compare | Except slider mode | Where safe | Slider divider wins |
| Smart Stitch | Yes | Yes | Seam controls remain buttons and win |
| Split | No | No | Split lines and click-to-add win |
| Shared file preview | Yes | Yes | Preview-only surface used by simple tools |

Safe Share and Combine retain their stable tool-specific viewport implementations; see section 17.

## 5. Drag/drop improvements

- Every connected workspace accepts file drops without removing picker or paste input.
- The full-workspace overlay says `Drop 2 screenshots to compare`, `Drop screenshots to stitch`, `Drop images to combine`, or the generic `Drop screenshots here`.
- Unsupported files continue through the runtime's controlled rejection messages.
- `dragenter` depth prevents flicker over nested children.
- Nested File Tray/drop-zone events stop propagation, preventing accidental double ingest.
- Same-identity files in one drop are deduplicated by name, bytes, MIME type and last-modified time.
- A global guard prevents the browser from navigating away when a file misses a drop target.
- The production E2E performs a real DOM file drop, verifies the overlay, verifies one new logical workspace item and verifies the live status announcement.

## 6. Reordering improvements

The File Tray is the single source of logical image order. Smart Stitch, Combine, PDF, Searchable PDF and Batch already consume this order, so reordering changes processing and export rather than only presentation.

- Desktop: dedicated `grab` handle and visible insertion edge.
- Touch/keyboard alternative: 44 px Move up/Move down buttons.
- Selection stays explicit and visually distinct.
- Drag state and insertion state clear at drop/end.
- Existing processing-order tests for Combine/PDF remain green.

Native touch drag-reorder was deliberately not added because HTML drag is inconsistent on mobile. The touch-sized order buttons provide the reliable non-drag alternative required for accessibility.

## 7. Keyboard shortcuts

- Shared viewport: `0`, `1`, `+`, `-`, Space-pan and safe `Esc`.
- History: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y.
- Export: existing Ctrl/Cmd+S.
- File picker: existing Ctrl/Cmd+O.
- Selection tools retain Delete/Backspace, 1 px arrows and 10 px Shift+Arrow.
- Inputs, textareas, selects, contenteditable elements and native interactive controls retain their normal keyboard behaviour.
- Buttons are disabled when actions are unavailable; icon-only controls have accessible names.

## 8. Mouse and touch behaviour

- Chromium production automation verifies real `mouse.wheel`, pointer anchor preservation and Space-drag scroll changes.
- WebKit automation verifies the same application listener with a standards-based `WheelEvent`; Playwright WebKit on Windows does not reliably route `mouse.wheel` into nested overflow elements.
- Two-finger pinch uses distance and midpoint changes; browser scroll is prevented only after a two-touch gesture is owned.
- One-finger editing remains available for annotation, crop, split and redaction.
- Existing Chromium touch automation verifies a split-line finger drag does not scroll the surrounding page.

These are browser automation results, not claims of Android or iPhone hardware testing.

## 9. Mobile improvements

- The existing shared bottom sheet remains capped at `85dvh`, scrollable and safe-area padded.
- Primary mobile actions remain in the sticky bottom bar.
- Inspector labels and slider values remain visible; dense Phase 3D controls use existing disclosure groups.
- File reorder alternatives and selection controls use existing 44 px targets.
- The 390 × 844 Phase 3E test verifies the Editor settings dialog has no horizontal overflow and remains vertically scrollable.

## 10. Accessibility

- Visible focus rings and Radix dialog focus management are preserved.
- Viewport actions have button names and keyboard equivalents.
- Actual-size retains the accessible name `Actual size` while visibly reporting `100%`.
- Status feedback is announced through `aria-live`/`role=status` and replaces the prior notice instead of stacking.
- Drag/drop always has Browse, paste and Move up/down alternatives.
- Compare flicker continues to obey `prefers-reduced-motion`.
- Active editing controls keep keyboard delete and nudge alternatives.

## 11. Success, error and progress improvements

- File ingest announces the number added and any controlled rejections.
- Fast repeated ingest actions replace the current notice; the timer is cleared on provider unmount.
- Beautifier reports the actual requested scale, for example `Rendering 4× image…`.
- Existing specific states remain: OCR progress/cancel, Batch file/progress/cancel, format encoding, difference analysis, stitching count, ZIP creation, copy success/fallback and verified Safe Share/PDF results.
- Existing controlled large-image and format-specific messages remain unchanged; no stack trace is exposed.

## 12. Performance impact

- No runtime dependency was added.
- Viewport motion changes CSS dimensions and scroll state only.
- Pointer movement writes scroll positions directly instead of causing React state updates per move.
- Wheel updates are animation-frame coalesced.
- Interaction previews remain bounded; export paths still use original pixels only for final work.
- Blob-first output, canvas release, ImageBitmap cleanup, object URL cleanup and worker lifecycle code were not changed.
- Homepage JavaScript is 683.5 KB raw / 207.0 KB gzip versus Phase 3D's 678.3 KB / 205.0 KB: +5.2 KB raw (+0.8%) and +2.0 KB gzip (+1.0%). This is small and consistent with the shared client interaction layer.
- The homepage production check confirms no eager OpenCV, Tesseract, pdf-lib, client-zip, worker, OCR model or tool implementation load.

## 13. Tests

Required gates on the final merged working tree:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | Pass with one pre-existing warning in `scripts/spikes/pdf-fixtures/generate.ts` (`addInkBands` unused); 0 errors |
| `npx vitest run` | 36 files passed, 3 skipped; 554 tests passed, 7 skipped |
| `npm run build` | Pass; 31 static pages generated |

New focused unit coverage includes scale limits, Fit/100%, zoom steps, pointer anchor math, pan clamping, shortcut modifiers, Space guard behaviour, mobile gesture ownership and dropped-file deduplication. Existing workspace-store coverage verifies logical reorder/history/reset behaviour.

## 14. Chromium results

- Phase 3E interaction suite: 4/4 passed in production mode.
- Final representative regression suite covering Annotate, Combine, Safe Share, Split, cross-tool handoffs, shared encoders, workspace mobile and homepage bundle/lazy-loading: 59/59 passed.
- Earlier broad Phase 3E regression run reached 105/106; the sole failure was the shared Actual-size button losing Compare's legacy accessible name/active class. That compatibility issue was fixed and its focused rerun passed 5/5 before the final representative run.
- Current verified total reported here: 63 passing production tests across the final two non-overlapping runs.

## 15. WebKit results

- Phase 3E interaction suite: 4/4 passed in production mode.
- Final representative regression suite: 54 passed, 5 skipped, 0 failed. The skips are existing browser/Chromium-specific cases, not Phase 3E failures.
- Current verified total reported here: 58 passed, 5 skipped across the final two non-overlapping runs.
- Playwright WebKit is not a claim of physical iPhone Safari testing.

## 16. Bundle results

| Metric | Phase 3D | Phase 3E | Change |
| --- | ---: | ---: | ---: |
| Homepage scripts | 10 | 10 | 0 |
| Raw JavaScript | 678.3 KB | 683.5 KB | +5.2 KB / +0.8% |
| Gzip JavaScript | 205.0 KB | 207.0 KB | +2.0 KB / +1.0% |

Both Chromium and WebKit measured the same final values. Heavy engines and workers remain lazy.

## 17. Features deliberately not applied and why

- **Safe Share shared viewport migration:** retained its stable Fit/50%/100%/200% editing viewport. The workspace patch guard repeatedly rejected edits to the redaction canvas as crossing a reparse-point boundary, despite read-only inspection. Bypassing the guard would be unsafe. Redaction draw/move/resize/nudge/export/mobile suites pass.
- **Combine shared viewport migration:** retained its bounded fitted/scrollable preview for the same guarded-path reason. Combine is preview-only, and its order/export/mobile suites pass. This is polish parity debt, not an output correctness defect.
- **Annotation object-bound snapping:** optional in the prompt and deliberately omitted. Centre/edge snapping in Beautifier delivers the useful lightweight case without introducing an object-layout/grid engine.
- **Native touch drag-reorder:** omitted in favour of reliable touch-sized Move up/down controls.
- **Extra before/after modes:** Editor already has Original/Edited; no duplicate full-resolution Beautifier or Compress buffer was introduced.
- **Global navigation confirmation:** not added. Workspace handoff preserves in-memory assets, and global browser prompts would be disruptive.
- **Fake progress percentages:** not added. Percentages appear only where the operation supplies measurable progress.

## 18. Remaining manual real-device checklist

No physical-device testing is claimed. Before public launch, run:

### Desktop mouse

- Wheel toward corners and centre in Editor, Annotate, Beautifier, Compare, Stitch and Split.
- Confirm the pointed pixel stays under the pointer.
- Hold Space, verify `grab` → `grabbing`, and pan at 100%/200%.
- Confirm crop handles, annotation drawing, compare divider and split lines win over pan.
- Drop valid, duplicate-in-one-drop, unsupported and oversized files.
- Drag-reorder Stitch/Combine/PDF/Batch and verify exported order.

### Laptop trackpad

- Pinch zoom and two-finger scroll separately.
- Confirm small scroll deltas scroll rather than unexpectedly zoom.
- Double-click Fit/100% and test shortcuts while an input is focused.

### Android touch

- Two-finger pinch and midpoint pan on every shared viewport.
- One-finger annotation drawing, crop handles, split lines and compare divider.
- Confirm the page scrolls normally outside an owned canvas gesture.
- Use Files/Settings sheets and Move up/down reordering at 390 px-equivalent width.

### iPhone/Safari touch

- Repeat Android cases in Safari, especially pinch handoff, safe-area bottom actions and sheet scrolling.
- Test clipboard permission denial and Copy PNG fallback.

### Dense mobile inspectors

- Beautifier: Canvas, Background, Screenshot, Text, Border/shadow and Export.
- Compare: modes, view, difference, regions and files.
- Editor: crop, transform, adjustments, guides and export.

## 19. Final launch recommendation

Phase 3E is suitable for a launch-candidate build. The automated correctness, mobile-layout, cross-tool, lazy-loading and browser gates are green, and the homepage increase is approximately 1% gzip with no heavy eager code.

Public launch should follow one short physical-device pass of the checklist above, with special attention to Safari/Android pinch ownership and trackpad wheel classification. Safe Share and Combine's older viewport controls are documented consistency limitations but are not output, accessibility or memory blockers. No further product-feature phase should begin before launch review.
