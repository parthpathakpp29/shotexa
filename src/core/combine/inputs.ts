import type { FileId, WorkspaceFile } from "@/core/runtime/types";

/**
 * A selected result becomes the primary source and hides the originals that produced it.
 * This lets “stitched result + another screenshot” work without re-uploading or accidentally
 * including every source screenshot a second time.
 */
export function selectCombineInputs(order: FileId[], files: Record<FileId, WorkspaceFile>, selectedId: FileId | null): FileId[] {
  const selected = selectedId ? files[selectedId] : undefined;
  if (selected?.kind !== "artifact") return order.filter((id) => !!files[id]);
  const derived = new Set(selected.derivedFrom ?? []);
  return [selected.id, ...order.filter((id) => id !== selected.id && !derived.has(id) && !!files[id])];
}
