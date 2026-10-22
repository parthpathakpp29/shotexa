import type { WorkspaceFile } from "@/core/runtime/types";

/** Keep editable sources in the tray, but use their sanitized copy in multi-image exports. */
export function batchEligibleImageIds(order: string[], files: Record<string, WorkspaceFile>): string[] {
  const replacedSources = new Set<string>();
  for (const id of order) {
    const file = files[id];
    if (file?.producedBy === "safe-share" || file?.producedBy === "blur") {
      for (const sourceId of file.derivedFrom ?? []) replacedSources.add(sourceId);
    }
  }
  return order.filter((id) => Boolean(files[id]) && files[id].kind !== "resource" && !replacedSources.has(id));
}
