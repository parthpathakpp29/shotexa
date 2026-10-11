import type { Rect, Size } from "@/core/image-transform/types";
import type { MultiLayout } from "./types";

export interface MultiPlacement {
  rect: Rect;
  rotation: number;
  z: number;
}

/** Constrained, deterministic arrangements. They deliberately expose composition, not freeform design. */
export function multiImageLayout(container: Rect, sources: Size[], mode: MultiLayout, spacingPercent: number): MultiPlacement[] {
  const count = Math.max(1, Math.min(mode === "single" ? 1 : mode === "side-by-side" || mode === "stacked" ? 2 : 3, sources.length || 1));
  const gap = (Math.min(container.width, container.height) * Math.max(0, Math.min(20, spacingPercent))) / 100;
  const fit = (box: Rect, source: Size): Rect => {
    const k = Math.min(box.width / Math.max(1, source.width), box.height / Math.max(1, source.height));
    const width = source.width * k;
    const height = source.height * k;
    return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
  };
  const source = (index: number) => sources[index] ?? sources[0] ?? { width: 1, height: 1 };
  if (count === 1 || mode === "single") return [{ rect: fit(container, source(0)), rotation: 0, z: 0 }];
  if (mode === "side-by-side") {
    const width = (container.width - gap) / 2;
    return [0, 1].map((index) => ({ rect: fit({ x: container.x + index * (width + gap), y: container.y, width, height: container.height }, source(index)), rotation: 0, z: index }));
  }
  if (mode === "stacked") {
    const height = (container.height - gap) / 2;
    return [0, 1].map((index) => ({ rect: fit({ x: container.x, y: container.y + index * (height + gap), width: container.width, height }, source(index)), rotation: 0, z: index }));
  }
  if (mode === "three-column") {
    const width = (container.width - gap * 2) / 3;
    return [0, 1, 2].map((index) => ({ rect: fit({ x: container.x + index * (width + gap), y: container.y, width, height: container.height }, source(index)), rotation: 0, z: index }));
  }
  const card = { width: container.width * 0.68, height: container.height * 0.82 };
  const rotations = mode === "fan" ? [-8, 0, 8] : [-3, 2, 6];
  const shifts = mode === "fan" ? [-0.18, 0, 0.18] : [-0.14, 0, 0.14];
  return [0, 1, 2].map((index) => ({
    rect: fit({ x: container.x + (container.width - card.width) / 2 + shifts[index] * container.width, y: container.y + (container.height - card.height) / 2 + (mode === "overlap" ? index * gap * 0.5 : 0), ...card }, source(index)),
    rotation: rotations[index],
    z: index,
  }));
}

