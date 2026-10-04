export interface FileIdentity {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

/** A bubbling drop must not enqueue the same browser File object more than once. */
export function dedupeDroppedFiles<T extends FileIdentity>(files: readonly T[]) {
  const seen = new Set<T>();
  return files.filter((file) => {
    if (seen.has(file)) return false;
    seen.add(file);
    return true;
  });
}
