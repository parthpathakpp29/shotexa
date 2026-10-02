/** Flat ZIP names with deterministic `-2`, `-3` collision suffixes. */
export function uniqueOutputNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((original) => {
    let candidate = original;
    const dot = original.lastIndexOf(".");
    const base = dot > 0 ? original.slice(0, dot) : original;
    const ext = dot > 0 ? original.slice(dot) : "";
    let suffix = 2;
    while (used.has(candidate.toLocaleLowerCase())) candidate = `${base}-${suffix++}${ext}`;
    used.add(candidate.toLocaleLowerCase());
    return candidate;
  });
}

