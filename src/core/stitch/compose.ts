import { StitchError, type StitchPlan } from "./types";

/**
 * Full-resolution composition from the ORIGINAL encoded files (never from proxies).
 * Runs where OffscreenCanvas exists (worker). Decodes each source once, draws only the
 * planned segments, encodes, and releases the bitmaps.
 *
 * Spike limitation: one output canvas. Very tall outputs can exceed browser canvas
 * limits — Spike B must define the tiled/segmented fallback (architecture §40–41).
 */
export async function composeStitch(
  a: Blob,
  b: Blob,
  plan: StitchPlan,
  opts: { type: string; quality?: number; signal?: { readonly aborted: boolean } },
): Promise<Blob> {
  const bitmaps: ImageBitmap[] = [];
  try {
    const [bmA, bmB] = await Promise.all([createImageBitmap(a), createImageBitmap(b)]).catch(() => {
      throw new StitchError("DECODE_FAILED");
    });
    bitmaps.push(bmA, bmB);
    if (opts.signal?.aborted) throw new StitchError("CANCELLED");

    const canvas = new OffscreenCanvas(plan.width, plan.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new RangeError("canvas allocation failed");
    if (opts.type === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, plan.width, plan.height);
    }
    for (const s of plan.segments) {
      const src = s.source === "a" ? bmA : bmB;
      if (s.height <= 0) continue;
      ctx.drawImage(src, 0, s.sy, src.width, s.height, 0, s.dy, src.width, s.height);
    }
    if (opts.signal?.aborted) throw new StitchError("CANCELLED");
    return await canvas.convertToBlob({ type: opts.type, quality: opts.quality });
  } finally {
    for (const bm of bitmaps) bm.close();
  }
}
