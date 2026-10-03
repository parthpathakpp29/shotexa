import { describe, expect, it } from "vitest";
import { MAX_TARGET_ATTEMPTS, searchTargetSize } from "@/core/image-encode/target-size";

describe("target-size quality search", () => {
  it("keeps the highest measured quality that meets a byte target", async () => {
    const r = await searchTargetSize(72_000, 1, async (quality) => Math.round(quality * 100_000));
    expect(r).toMatchObject({ quality: 0.72, bytes: 72_000, metTarget: true });
    expect(r.attempts).toBeLessThanOrEqual(MAX_TARGET_ATTEMPTS);
  });

  it("reports the smallest measured result when the target is impossible at 50%", async () => {
    const r = await searchTargetSize(1_000, 0.8, async (quality) => Math.round(10_000 + quality * 10_000));
    expect(r).toMatchObject({ quality: 0.5, bytes: 15_000, metTarget: false });
    expect(r.attempts).toBeLessThanOrEqual(MAX_TARGET_ATTEMPTS);
  });
});
