import type { MatchResult, TemplateMatcher } from "./matcher";
import type { GrayImage } from "./types";

/**
 * Minimal structural type for the parts of OpenCV.js we use. Keeps the (huge) OpenCV
 * typings out of the stitch module and lets tests inject a Node-loaded instance.
 */
export interface CvMat {
  data32F: Float32Array;
  rows: number;
  cols: number;
  delete(): void;
}
export interface OpenCvLike {
  CV_8UC1: number;
  TM_CCOEFF_NORMED: number;
  Mat: new () => CvMat;
  matFromArray(rows: number, cols: number, type: number, data: ArrayLike<number>): CvMat;
  matchTemplate(image: CvMat, templ: CvMat, result: CvMat, method: number): void;
}

export function createOpenCvMatcher(cv: OpenCvLike): TemplateMatcher {
  return {
    name: "opencv:TM_CCOEFF_NORMED",
    match(search: GrayImage, template: GrayImage, suppressRows: number): MatchResult {
      const mats: CvMat[] = [];
      try {
        const s = cv.matFromArray(search.height, search.width, cv.CV_8UC1, search.data);
        mats.push(s);
        const t = cv.matFromArray(template.height, template.width, cv.CV_8UC1, template.data);
        mats.push(t);
        const r = new cv.Mat();
        mats.push(r);
        cv.matchTemplate(s, t, r, cv.TM_CCOEFF_NORMED);
        return scanPeaks(r.data32F, r.rows, r.cols, suppressRows);
      } finally {
        for (const m of mats) m.delete();
      }
    },
  };
}

/** Best peak and best peak outside ±suppressRows (row-wise max over columns). */
export function scanPeaks(data: Float32Array, rows: number, cols: number, suppressRows: number): MatchResult {
  const rowMax = new Float32Array(rows);
  const rowArg = new Int32Array(rows);
  let best = -Infinity;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < rows; y++) {
    let m = -Infinity;
    let mx = 0;
    for (let x = 0; x < cols; x++) {
      const v = data[y * cols + x];
      // NaN/Inf occur for flat regions under TM_CCOEFF_NORMED — treat as no match.
      if (Number.isFinite(v) && v > m) {
        m = v;
        mx = x;
      }
    }
    rowMax[y] = m;
    rowArg[y] = mx;
    if (m > best) {
      best = m;
      bx = mx;
      by = y;
    }
  }
  let second = -1;
  for (let y = 0; y < rows; y++) {
    if (Math.abs(y - by) > suppressRows && rowMax[y] > second) second = rowMax[y];
  }
  return { x: bx, y: by, score: Number.isFinite(best) ? best : -1, secondScore: second };
}
