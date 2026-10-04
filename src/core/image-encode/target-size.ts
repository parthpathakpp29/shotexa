/**
 * Bounded quality search for an explicitly requested JPEG/WebP byte target.
 *
 * Browser encoders are not guaranteed perfectly monotonic, so this finds the highest measured
 * whole-percent quality at or below the target and retains the smallest measured fallback when
 * even 50% cannot meet it. It never resizes or changes the user-selected format.
 */
export const MIN_TARGET_QUALITY = 0.5;
export const MAX_TARGET_ATTEMPTS = 7;

export interface TargetSizeSearch {
  quality: number;
  bytes: number;
  metTarget: boolean;
  attempts: number;
}

export async function searchTargetSize(
  targetBytes: number,
  maximumQuality: number,
  measure: (quality: number) => Promise<number>,
): Promise<TargetSizeSearch> {
  let low = Math.round(MIN_TARGET_QUALITY * 100);
  let high = Math.max(low, Math.min(100, Math.round(maximumQuality * 100)));
  let best: TargetSizeSearch | null = null;
  let smallest: TargetSizeSearch | null = null;
  let attempts = 0;

  while (low <= high && attempts < MAX_TARGET_ATTEMPTS) {
    // Check the user-selected quality first. It avoids unnecessary work when it already fits.
    const qualityPct = attempts === 0 ? high : Math.ceil((low + high) / 2);
    const quality = qualityPct / 100;
    const bytes = await measure(quality);
    attempts += 1;
    const measured = { quality, bytes, metTarget: bytes <= targetBytes, attempts };
    if (!smallest || bytes < smallest.bytes) smallest = measured;
    if (bytes <= targetBytes) {
      if (!best || quality > best.quality) best = measured;
      low = qualityPct + 1;
    } else {
      high = qualityPct - 1;
    }
  }

  const result = best ?? smallest;
  // `maximumQuality` is always clamped above the minimum, so at least one attempt is made.
  if (!result) throw new Error("TARGET_SEARCH_EMPTY");
  return { ...result, attempts };
}
