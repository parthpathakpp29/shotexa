/**
 * Full-resolution annotated export. This IS the Screenshot Editor pipeline (`renderTransform`):
 * the original file is decoded, the pending crop/rotate/flip/resize applied, and the
 * annotations drawn on top in the same pass — single canvas or tiled PNG — then verified.
 */
import { renderTransform } from "@/core/image-transform/render";
import type { ImageTransform, TransformExportOptions, TransformExportResult } from "@/core/image-transform/types";
import { annotationFrame, toOutput } from "./geometry";
import { drawAnnotations } from "./render";
import { AnnotationError, type AnnotationObject } from "./types";

export async function renderAnnotated(image: Blob, t: ImageTransform, annotations: AnnotationObject[], o: TransformExportOptions): Promise<TransformExportResult> {
  if (!annotations.length) throw new AnnotationError("ANNOTATION_EMPTY");
  const frame = annotationFrame(t, o.source);
  const projected = annotations.map((a) => toOutput(a, frame));
  return renderTransform(image, t, {
    ...o,
    overlay: (ctx, _out, offsetY) => drawAnnotations(ctx, projected, 1, offsetY),
  });
}
