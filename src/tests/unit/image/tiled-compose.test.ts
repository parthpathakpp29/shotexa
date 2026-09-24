import { describe, expect, it } from "vitest";
import { composeTiles, lastTileUse, planTiles, type ComposePlan } from "@/core/image/tiled-compose";

describe("tile planning", () => {
  it("covers the full height with a short last tile", () => {
    expect(planTiles(10_000, 4096)).toEqual([
      { y: 0, height: 4096 },
      { y: 4096, height: 4096 },
      { y: 8192, height: 1808 },
    ]);
  });

  it("knows the last tile that needs each source", () => {
    const plan: ComposePlan = {
      width: 10,
      height: 9000,
      segments: [
        { source: 0, sy: 0, height: 3000, dy: 0 },
        { source: 1, sy: 500, height: 6000, dy: 3000 },
      ],
    };
    expect(lastTileUse(plan, 2048)).toEqual(new Map([[0, 1], [1, 4]]));
  });
});

/** Minimal canvas fake: records drawImage calls per tile. */
function fakeCanvas(width: number, height: number) {
  const draws: unknown[][] = [];
  const canvas = {
    width,
    height,
    draws,
    getContext: () => ({
      clearRect() {},
      fillRect() {},
      set fillStyle(_v: string) {},
      drawImage: (...args: unknown[]) => draws.push(args),
    }),
  };
  return canvas as unknown as OffscreenCanvas & { draws: unknown[][] };
}

describe("composeTiles", () => {
  it("draws each tile from the right source rows and releases sources early", async () => {
    const events: string[] = [];
    const plan: ComposePlan = {
      width: 100,
      height: 5000,
      segments: [
        { source: 0, sy: 0, height: 2500, dy: 0 },
        { source: 1, sy: 300, height: 2500, dy: 2500 },
      ],
    };
    let canvas!: ReturnType<typeof fakeCanvas>;
    const tiles: { y: number; draws: unknown[][] }[] = [];
    await composeTiles(
      plan,
      {
        get: async (s) => {
          events.push(`get${s}`);
          return { width: 100, height: 3000 } as unknown as ImageBitmap;
        },
        release: (s) => events.push(`release${s}`),
      },
      {
        tileHeight: 2000,
        createCanvas: (w, h) => (canvas = fakeCanvas(w, h)),
        onTile: (t) => {
          tiles.push({ y: t.y, draws: canvas.draws.splice(0) });
          events.push(`tile${t.index}`);
        },
      },
    );
    // Tile 1 spans rows 2000–4000: 500 rows of source 0 then 1500 rows of source 1 (from sy 300).
    expect(tiles[1].draws).toEqual([
      [{ width: 100, height: 3000 }, 0, 2000, 100, 500, 0, 0, 100, 500],
      [{ width: 100, height: 3000 }, 0, 300, 100, 1500, 0, 500, 100, 1500],
    ]);
    // Source 0 is released right after tile 1 — before tile 2 is drawn.
    expect(events.indexOf("release0")).toBeLessThan(events.indexOf("tile2"));
    expect(events.filter((e) => e.startsWith("tile"))).toHaveLength(3);
    expect(canvas.width).toBe(0);
  });

  it("stops on cancellation and still releases sources", async () => {
    const released: number[] = [];
    const signal = { aborted: false };
    await expect(
      composeTiles(
        { width: 10, height: 100, segments: [{ source: 0, sy: 0, height: 100, dy: 0 }] },
        { get: async () => ({ width: 10, height: 100 }) as unknown as ImageBitmap, release: (s) => released.push(s) },
        { tileHeight: 10, createCanvas: fakeCanvas, onTile: (t) => void (t.index === 2 && (signal.aborted = true)), signal },
      ),
    ).rejects.toThrow("CANCELLED");
    expect(released).toEqual([0]);
  });
});
