import type { GrayImage } from "./types";

/**
 * Vendor-neutral template matching contract. OpenCV.js is the V1 implementation
 * (`opencv-matcher.ts`); the stitch algorithm only depends on this interface.
 */
export interface MatchResult {
  /** Top-left of the best match inside `search`. */
  x: number;
  y: number;
  score: number;
  /** Best score whose row is outside ±suppressRows of the best row. -1 if none. */
  secondScore: number;
}

export interface TemplateMatcher {
  readonly name: string;
  /** Normalised cross-correlation (zero-mean). `template` must fit inside `search`. */
  match(search: GrayImage, template: GrayImage, suppressRows: number): MatchResult;
}
