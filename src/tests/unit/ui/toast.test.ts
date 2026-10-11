import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/toaster";
import { toast, useToastStore } from "@/components/ui/use-toast";

describe("toast store", () => {
  afterEach(() => {
    vi.useRealTimers();
    useToastStore.setState({ toasts: [] });
  });

  it("deduplicates an active announcement but allows a different description", () => {
    toast({ type: "success", message: "Download started", description: "first.png" });
    toast({ type: "success", message: "Download started", description: "first.png" });
    toast({ type: "success", message: "Download started", description: "second.png" });

    expect(useToastStore.getState().toasts.map(({ message, description }) => ({ message, description }))).toEqual([
      { message: "Download started", description: "first.png" },
      { message: "Download started", description: "second.png" },
    ]);
  });

  it("auto-dismisses by default, keeps persistent notices, and supports manual close", () => {
    vi.useFakeTimers();
    toast({ type: "success", message: "Saved" });
    toast({ type: "info", message: "Working", duration: 0 });
    const [saved, working] = useToastStore.getState().toasts;

    vi.advanceTimersByTime(4_000);
    expect(useToastStore.getState().toasts).toEqual([working]);
    useToastStore.getState().removeToast(working.id);
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(saved.id).toBeTruthy();
  });

  it("keeps at most five visible notices", () => {
    for (let index = 0; index < 6; index++) toast({ type: "info", message: `Notice ${index}`, duration: 0 });
    expect(useToastStore.getState().toasts.map((item) => item.message)).toEqual([
      "Notice 1", "Notice 2", "Notice 3", "Notice 4", "Notice 5",
    ]);
  });
});

describe("Toaster", () => {
  afterEach(() => useToastStore.setState({ toasts: [] }));

  it("uses a polite status live region, safe-area insets, and labelled close controls", () => {
    const markup = renderToStaticMarkup(createElement(Toaster));
    const source = readFileSync(new URL("../../../components/ui/toaster.tsx", import.meta.url), "utf8");

    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("safe-area-inset-bottom");
    expect(markup).toContain("safe-area-inset-right");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-label={`Close ${toast.message}`}');
  });
});
