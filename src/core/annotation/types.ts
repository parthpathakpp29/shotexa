/**
 * Annotation model: small, serialisable vector objects — never rasters.
 *
 * Every coordinate and length is in SOURCE-image pixels (the original file, before any
 * Screenshot Editor crop/rotate/flip/resize). Annotations are projected through the editor's
 * own source→output matrix for display and export, so they stay attached to the same image
 * content whatever the pending transform does.
 */
import type { Point, Rect } from "@/core/image-transform/types";

export type { Point, Rect };

export type AnnotationTool = "select" | "arrow" | "rectangle" | "highlight" | "text" | "freehand" | "step";
export type AnnotationKind = Exclude<AnnotationTool, "select">;

interface Base {
  id: string;
  color: string;
}

export interface ArrowAnnotation extends Base {
  type: "arrow";
  from: Point;
  to: Point;
  width: number;
}

export interface RectangleAnnotation extends Base {
  type: "rectangle";
  rect: Rect;
  width: number;
}

export interface HighlightAnnotation extends Base {
  type: "highlight";
  rect: Rect;
  /** 0–1. Drawn with a multiply blend, so text underneath stays readable. */
  opacity: number;
}

export interface TextAnnotation extends Base {
  type: "text";
  /** Top-left of the first line, in the upright output frame. */
  at: Point;
  text: string;
  size: number;
}

export interface FreehandAnnotation extends Base {
  type: "freehand";
  /** Simplified path — never thousands of raw pointer samples. */
  points: Point[];
  width: number;
}

export interface StepAnnotation extends Base {
  type: "step";
  /** Centre of the marker. */
  at: Point;
  n: number;
  radius: number;
}

export type AnnotationObject = ArrowAnnotation | RectangleAnnotation | HighlightAnnotation | TextAnnotation | FreehandAnnotation | StepAnnotation;

/** Defaults for new objects. Null sizes mean "automatic" — proportional to the image. */
export interface AnnotationStyle {
  color: string;
  highlightColor: string;
  highlightOpacity: number;
  /** Output pixels, or null for automatic. */
  strokeWidth: number | null;
  fontSize: number | null;
}

export interface AnnotationSession {
  byAsset: Record<string, AnnotationObject[]>;
  selectedId: string | null;
  tool: AnnotationTool;
  style: AnnotationStyle;
}

export type AnnotationErrorCode = "ANNOTATION_EMPTY" | "ANNOTATION_INVALID";

export class AnnotationError extends Error {
  constructor(
    readonly code: AnnotationErrorCode,
    detail?: string,
  ) {
    super(detail ?? code);
    this.name = "AnnotationError";
  }
}
