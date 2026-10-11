import { useEffect, useSyncExternalStore } from "react";

/**
 * Blob URLs for on-screen previews (`<img src>`), owned by the components that show them.
 *
 * A URL is created when a component starts showing a Blob — in an effect, never during
 * render, so a render React throws away cannot leak one — and shared by every component
 * showing the same Blob. When the last one stops, the URL is revoked once the current
 * commit's work is done (a microtask, not a timer): React StrictMode and re-keyed lists
 * stop and restart showing a Blob within one commit, and that must not revoke a URL an
 * image is still displaying.
 */
interface Entry {
  url: string;
  holders: number;
}

const entries = new Map<Blob, Entry>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function holdObjectUrl(blob: Blob): string {
  let entry = entries.get(blob);
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), holders: 0 };
    entries.set(blob, entry);
    queueMicrotask(emit);
  }
  entry.holders++;
  return entry.url;
}

export function releaseObjectUrl(blob: Blob): void {
  const entry = entries.get(blob);
  if (!entry) return;
  entry.holders = Math.max(0, entry.holders - 1);
  queueMicrotask(() => {
    if (entries.get(blob) !== entry || entry.holders > 0) return;
    entries.delete(blob);
    URL.revokeObjectURL(entry.url);
    emit();
  });
}

/** How many preview URLs are alive (diagnostics and tests). */
export const liveObjectUrls = () => entries.size;

/** One URL per Blob, `null` until the component has mounted. Pass a stable array. */
export function useObjectUrls(blobs: readonly Blob[]): (string | null)[] {
  const key = useSyncExternalStore(subscribe, () => blobs.map((blob) => entries.get(blob)?.url ?? "").join("\n"), () => "");
  useEffect(() => {
    blobs.forEach(holdObjectUrl);
    return () => blobs.forEach(releaseObjectUrl);
  }, [blobs]);
  const parts = key.split("\n");
  return blobs.map((_, index) => parts[index] || null);
}
