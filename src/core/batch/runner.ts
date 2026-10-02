export interface SequentialHooks<T> {
  before?(id: string, index: number): void;
  success?(id: string, value: T, index: number): void;
  failure?(id: string, error: unknown, index: number): void;
  cancelled?(id: string, index: number): void;
  /** Yield to the browser between full-resolution jobs so Cancel/input can be handled. */
  between?(id: string, index: number): Promise<void>;
}

/** One job at a time. A failure is isolated; cancellation stops before the next item. */
export async function runSequential<T>(
  ids: string[],
  process: (id: string, index: number) => Promise<T>,
  signal: { readonly aborted: boolean },
  hooks: SequentialHooks<T> = {},
): Promise<{ completed: number; failed: number; cancelled: number }> {
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    if (signal.aborted) {
      for (let j = index; j < ids.length; j++) { hooks.cancelled?.(ids[j], j); cancelled++; }
      break;
    }
    hooks.before?.(id, index);
    try {
      const value = await process(id, index);
      if (signal.aborted) {
        hooks.cancelled?.(id, index);
        cancelled++;
        for (let j = index + 1; j < ids.length; j++) { hooks.cancelled?.(ids[j], j); cancelled++; }
        break;
      }
      hooks.success?.(id, value, index);
      completed++;
      if (index < ids.length - 1) await hooks.between?.(id, index);
    } catch (error) {
      const cancelledJob = signal.aborted || (error as { code?: string })?.code === "CANCELLED" || (error as { code?: string })?.code?.endsWith("_CANCELLED");
      if (cancelledJob) {
        hooks.cancelled?.(id, index);
        cancelled++;
        for (let j = index + 1; j < ids.length; j++) { hooks.cancelled?.(ids[j], j); cancelled++; }
        break;
      }
      hooks.failure?.(id, error, index);
      failed++;
      if (index < ids.length - 1) await hooks.between?.(id, index);
    }
  }
  return { completed, failed, cancelled };
}
