# Phase 2A — Safe Share, Blur and Privacy Clean

Branch `phase-2a/safe-share` · commit `0354388` · 35 files, ~1,530 insertions.
Screenshots: `docs/phase-2a/screenshots/`.

## What was built

Three live routes sharing one redaction engine and one workspace shell:

- `/redact-screenshot` — **Safe Share**, blackout by default.
- `/blur-screenshot` — **Blur**, blur by default (same tool, different starting mode).
- `/remove-image-metadata` — **Privacy Clean**, inspect and strip private metadata.

Redaction supports three modes — `blackout`, `blur` and `pixelate` — drawn as editable
regions on a canvas, with undo/redo through the existing command history. Export flattens
every region into the pixels at full resolution, then runs Privacy Clean over the encoded
result and verifies it before handing back a file.

New core modules: `src/core/redaction/{types,geometry,render}.ts`.
New UI: `redaction-{tool,canvas,inspector}.tsx`, `metadata-{tool,landing}.tsx`, `privacy-landing.tsx`.

## Architecture decisions

- **Redaction is destructive at export, never at edit time.** Regions stay editable
  operations in Zustand (small, serialisable) until the user exports; `renderSafeShare`
  then draws them permanently into a full-resolution canvas. There is no layer in the
  output that a viewer could remove.
- **Safe Share runs Privacy Clean automatically.** `renderSafeShare` calls
  `runMetadataClean` on the encoded blob, so a redacted file cannot leave with the GPS or
  EXIF data of the original. This is why Privacy Clean is *not* recommended as a follow-up
  action after Safe Share.
- **Export is verified, not assumed.** The output is re-read with `readImageSize` and
  re-decoded; a dimension change or a failed metadata verification raises
  `REDACTION_VERIFY_FAILED` instead of returning a file.
- **Blur and Safe Share are one component.** `RedactionTool` takes a `defaultMode`, so the
  two routes stay in sync and only differ in SEO copy and the mode they open with.
- Worker-first with a main-thread fallback, matching the Spike B capability pattern.

## Reused spike work

- **Spike E (metadata):** `src/core/metadata/*` — the container parsers, policy and
  verification — was reused unchanged; Phase 2A added the UI and wired it into export.
- **Spike B (memory):** canvas reset after drawing, bitmap closing, and the worker/main
  thread split.

## Tests and validation

- Unit: `src/tests/unit/redaction/redaction-core.test.ts` (geometry and clamping), plus
  metadata core and fuzz suites carried over from Spike E.
- Runtime: `src/tests/unit/workspace/runtime.test.ts` gained Safe Share and metadata cases.
- E2E: `src/tests/e2e/safe-share.spec.ts` — 8 tests covering all three modes, the
  Smart Stitch → Safe Share handoff, mobile, and an assertion that no screenshot bytes are
  uploaded.

## Known limitations

- Blur and pixelate are visual obfuscation. They are applied at full resolution and
  flattened, but blackout is the only mode that removes the underlying signal entirely;
  the UI presents blackout as the default for that reason.
- Very large images can exceed the canvas budget and fail with
  `REDACTION_MEMORY_PRESSURE` rather than degrading.
- Region drawing is pointer-based; there is no keyboard-only way to create a region yet
  (existing regions can be selected and removed with the keyboard).
