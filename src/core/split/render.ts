/**
 * Full-resolution Split export, from the ORIGINAL file (never the preview).
 *
 * The source is decoded ONCE; each piece is then rendered as an identity-orientation crop
 * through the Screenshot Editor pipeline (`renderDecoded`), so every piece gets the same
 * single-canvas / tiled-PNG choice, memory limits, pixel-exact 1:1 copy, encoder
 * verification and canvas cleanup — and no giant duplicate canvas of the whole image is made.
 */
import { renderDecoded, decodeSource } from "@/core/image-transform/render";
import { IDENTITY_TRANSFORM } from "@/core/image-transform/transform";
import { EditorError, type TransformExportOptions } from "@/core/image-transform/types";
import { validatePieces } from "./plan";
import { SplitError, type SplitExportPiece, type SplitExportResult, type SplitPiece } from "./types";

export type SplitRenderOptions = Omit<TransformExportOptions, "overlay">;

/** The crop transform for one piece: full width, rows [y0, y1). */
export const pieceTransform = (p: SplitPiece, width: number) => ({ ...IDENTITY_TRANSFORM, crop: { x: 0, y: p.y0, width, height: p.y1 - p.y0 } });

export async function renderSplit(image: Blob, pieces: SplitPiece[], o: SplitRenderOptions): Promise<SplitExportResult> {
  const issues = validatePieces(pieces, o.source.height, true);
  if (issues.includes("NOTHING_TO_SPLIT")) throw new SplitError("SPLIT_NOTHING_TO_SPLIT");
  if (issues.length) throw new SplitError("SPLIT_INVALID", issues.join(","));
  const started = performance.now();
  let bitmap: ImageBitmap | null = null;
  const out: SplitExportPiece[] = [];
  let tiled = false;
  try {
    bitmap = await decodeSource(image, o.source);
    for (const piece of pieces) {
      const base = piece.index / pieces.length;
      const result = await renderDecoded(bitmap, pieceTransform(piece, o.source.width), {
        ...o,
        onProgress: (p) => o.onProgress?.(Math.min(0.99, base + p / pieces.length)),
      });
      tiled ||= result.strategy === "tiled-png";
      out.push({ blob: result.blob, width: result.width, height: result.height });
      await o.yieldBetweenTiles?.();
    }
  } catch (error) {
    if (error instanceof EditorError || error instanceof SplitError) throw error;
    if (error instanceof RangeError) throw new EditorError("EDITOR_MEMORY_PRESSURE");
    throw new EditorError("EDITOR_MEMORY_PRESSURE", String(error));
  } finally {
    bitmap?.close();
  }
  o.onProgress?.(1);
  return { pieces: out, strategy: tiled ? "tiled-png" : "single-canvas", ms: Math.round(performance.now() - started) };
}
