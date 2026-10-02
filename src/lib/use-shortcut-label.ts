"use client";

import { useSyncExternalStore } from "react";

const isApple = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
// The platform never changes; notify once after mount so hydrated markup switches from the
// server snapshot to the real platform.
const subscribe = (notify: () => void) => {
  const t = setTimeout(notify, 0);
  return () => clearTimeout(t);
};

/**
 * Platform shortcut label: "⌘V" on Apple devices, "Ctrl V" elsewhere. The server renders
 * the Apple form; the client corrects it right after hydration (no mismatch warning).
 */
export function useShortcutLabel(key: string): string {
  const apple = useSyncExternalStore(subscribe, isApple, () => true);
  return apple ? `⌘${key}` : `Ctrl ${key}`;
}
