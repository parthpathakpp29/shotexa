/**
 * Tiled, sequential composition.
 *
 * Renders an output of any height as a sequence of horizontal tiles, drawing into ONE
 * reusable tile canvas. Sources are decoded lazily and released as soon as no later tile
 * needs them, so peak decoded memory ≈ (sources overlapping one tile) + one tile — not
 * (all sources + one giant output canvas).
 *
 * The same tile stream feeds: a streaming PNG encoder (one tall PNG), split image output
 * (one file per tile/section), or PDF pages.
 */
export interface ComposeSegment {
  source: number;
  /** Source row where the copied band starts. */
  sy: number;
  height: number;
  /** Output row where the band is placed. */
  dy: number;
}

export interface ComposePlan {
  width: number;
  height: number;
  segments: ComposeSegment[];
  /** Fill colour behind sources (needed for JPEG / uneven widths). Default: transparent. */
  background?: string;
}

export interface BitmapProvider {
  get(source: number): Promise<CanvasImageSource & { width: number; height: number }>;
  release(source: number): void;
}

export interface TileContext {
  /** Output row of the tile's first row. */
  y: number;
  height: number;
  index: number;
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
}

export interface ComposeTilesOptions {
  tileHeight: number;
  signal?: { readonly aborted: boolean };
  /** Defaults to OffscreenCanvas (worker). Main-thread fallback may pass a DOM canvas factory. */
  createCanvas?: (width: number, height: number) => OffscreenCanvas | HTMLCanvasElement;
  onTile(tile: TileContext): Promise<void> | void;
}

export class ComposeCancelledError extends Error {
  constructor() {
    super("CANCELLED");
  }
}

export function planTiles(height: number, tileHeight: number): { y: number; height: number }[] {
  const tiles = [];
  for (let y = 0; y < height; y += tileHeight) tiles.push({ y, height: Math.min(tileHeight, height - y) });
  return tiles;
}

/** For each source, the index of the last tile that draws from it. */
export function lastTileUse(plan: ComposePlan, tileHeight: number): Map<number, number> {
  const last = new Map<number, number>();
  for (const s of plan.segments) {
    if (s.height <= 0) continue;
    const t = Math.floor((s.dy + s.height - 1) / tileHeight);
    last.set(s.source, Math.max(last.get(s.source) ?? -1, t));
  }
  return last;
}

export async function composeTiles(plan: ComposePlan, provider: BitmapProvider, opts: ComposeTilesOptions): Promise<void> {
  const tiles = planTiles(plan.height, opts.tileHeight);
  const lastUse = lastTileUse(plan, opts.tileHeight);
  const make = opts.createCanvas ?? ((w, h) => new OffscreenCanvas(w, h));
  const canvas = make(plan.width, Math.min(opts.tileHeight, plan.height));
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new RangeError("tile canvas allocation failed");
  const released = new Set<number>();

  try {
    for (const [index, tile] of tiles.entries()) {
      if (opts.signal?.aborted) throw new ComposeCancelledError();
      if (tile.height !== canvas.height) canvas.height = tile.height; // last tile
      ctx.clearRect(0, 0, plan.width, tile.height);
      if (plan.background) {
        ctx.fillStyle = plan.background;
        ctx.fillRect(0, 0, plan.width, tile.height);
      }
      for (const s of plan.segments) {
        const top = Math.max(s.dy, tile.y);
        const bottom = Math.min(s.dy + s.height, tile.y + tile.height);
        if (bottom <= top) continue;
        const bm = await provider.get(s.source);
        const sy = s.sy + (top - s.dy);
        ctx.drawImage(bm, 0, sy, bm.width, bottom - top, 0, top - tile.y, bm.width, bottom - top);
      }
      await opts.onTile({ y: tile.y, height: tile.height, index, canvas, ctx });
      for (const [source, last] of lastUse) {
        if (last <= index && !released.has(source)) {
          provider.release(source);
          released.add(source);
        }
      }
    }
  } finally {
    for (const source of lastUse.keys()) if (!released.has(source)) provider.release(source);
    canvas.width = 0; // drop the tile backing store promptly
    canvas.height = 0;
  }
}

/**
 * Decodes Blobs on demand with `createImageBitmap` and closes them on release.
 * Tracks the peak number of simultaneously decoded bytes for diagnostics.
 */
export function createBlobBitmapProvider(blobs: Blob[]) {
  const live = new Map<number, Promise<ImageBitmap>>();
  let liveBytes = 0;
  let peakBytes = 0;
  let decodes = 0;
  const sizes = new Map<number, number>();
  return {
    get(source: number) {
      let p = live.get(source);
      if (!p) {
        decodes++;
        p = createImageBitmap(blobs[source]).then((bm) => {
          const bytes = bm.width * bm.height * 4;
          sizes.set(source, bytes);
          liveBytes += bytes;
          peakBytes = Math.max(peakBytes, liveBytes);
          return bm;
        });
        live.set(source, p);
      }
      return p;
    },
    release(source: number) {
      const p = live.get(source);
      if (!p) return;
      live.delete(source);
      void p.then((bm) => {
        bm.close();
        liveBytes -= sizes.get(source) ?? 0;
      });
    },
    stats: () => ({ peakDecodedBytes: peakBytes, decodes }),
  } satisfies BitmapProvider & { stats(): { peakDecodedBytes: number; decodes: number } };
}
