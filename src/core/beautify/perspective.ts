import type { Rect } from "@/core/image-transform/types";
import type { BeautifyPerspective, PerspectiveLayout, PerspectivePreset, Point } from "./types";

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);

export const PERSPECTIVE_PRESETS: Record<PerspectivePreset, Omit<BeautifyPerspective, "preset">> = {
  flat: { rotateX: 0, rotateY: 0, rotateZ: 0, depth: 900, originX: 50, originY: 50 },
  "tilt-left": { rotateX: 2, rotateY: -9, rotateZ: -2, depth: 1050, originX: 50, originY: 50 },
  "tilt-right": { rotateX: 2, rotateY: 9, rotateZ: 2, depth: 1050, originX: 50, originY: 50 },
  "perspective-left": { rotateX: 3, rotateY: -20, rotateZ: -1, depth: 760, originX: 48, originY: 50 },
  "perspective-right": { rotateX: 3, rotateY: 20, rotateZ: 1, depth: 760, originX: 52, originY: 50 },
  floating: { rotateX: -5, rotateY: 6, rotateZ: -2, depth: 1200, originX: 50, originY: 50 },
  "isometric-left": { rotateX: 24, rotateY: -28, rotateZ: -8, depth: 1000, originX: 50, originY: 50 },
  "isometric-right": { rotateX: 24, rotateY: 28, rotateZ: 8, depth: 1000, originX: 50, originY: 50 },
  custom: { rotateX: 0, rotateY: 0, rotateZ: 0, depth: 900, originX: 50, originY: 50 },
};

export function perspectiveForPreset(preset: PerspectivePreset): BeautifyPerspective {
  return { preset, ...PERSPECTIVE_PRESETS[preset] };
}

export function perspectiveActive(p: BeautifyPerspective): boolean {
  return Math.abs(p.rotateX) > 0.001 || Math.abs(p.rotateY) > 0.001 || Math.abs(p.rotateZ) > 0.001;
}

/**
 * Project a rectangular composition through a small, deterministic CSS-like camera model.
 * The result is pure canvas geometry, shared by preview and export. Point order is TL, TR, BR, BL.
 */
export function projectPerspective(rect: Rect, input: BeautifyPerspective): PerspectiveLayout {
  const p = {
    rotateX: finite(input.rotateX, 0),
    rotateY: finite(input.rotateY, 0),
    rotateZ: finite(input.rotateZ, 0),
    depth: Math.max(200, finite(input.depth, 900)),
    originX: Math.max(0, Math.min(100, finite(input.originX, 50))),
    originY: Math.max(0, Math.min(100, finite(input.originY, 50))),
  };
  if (!perspectiveActive(input)) {
    const quad = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ] as const;
    return { quad, bounds: { ...rect }, active: false };
  }

  const ox = rect.x + (rect.width * p.originX) / 100;
  const oy = rect.y + (rect.height * p.originY) / 100;
  const rx = rad(p.rotateX);
  const ry = rad(p.rotateY);
  const rz = rad(p.rotateZ);
  const sx = Math.sin(rx), cx = Math.cos(rx);
  const sy = Math.sin(ry), cy = Math.cos(ry);
  const sz = Math.sin(rz), cz = Math.cos(rz);
  const focal = (Math.max(rect.width, rect.height) * p.depth) / 100;

  const transform = (point: Point): Point => {
    let x = point.x - ox;
    let y = point.y - oy;
    let z = 0;
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    const camera = focal / Math.max(focal - z, focal * 0.15);
    return { x: ox + x * camera, y: oy + y * camera };
  };
  const quad = [
    transform({ x: rect.x, y: rect.y }),
    transform({ x: rect.x + rect.width, y: rect.y }),
    transform({ x: rect.x + rect.width, y: rect.y + rect.height }),
    transform({ x: rect.x, y: rect.y + rect.height }),
  ] as const;
  const left = Math.min(...quad.map((point) => point.x));
  const top = Math.min(...quad.map((point) => point.y));
  const right = Math.max(...quad.map((point) => point.x));
  const bottom = Math.max(...quad.map((point) => point.y));
  return { quad, bounds: { x: left, y: top, width: right - left, height: bottom - top }, active: true };
}

export function translatePerspective(layout: PerspectiveLayout, x: number, y: number): PerspectiveLayout {
  const dx = x - layout.bounds.x;
  const dy = y - layout.bounds.y;
  return {
    active: layout.active,
    bounds: { ...layout.bounds, x, y },
    quad: layout.quad.map((point) => ({ x: point.x + dx, y: point.y + dy })) as unknown as PerspectiveLayout["quad"],
  };
}

