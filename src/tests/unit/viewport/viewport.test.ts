import { describe, expect, it, vi } from "vitest";
import {
  clampPan,
  clampScale,
  effectiveScale,
  MAX_VIEWPORT_SCALE,
  MIN_VIEWPORT_SCALE,
  ownsMobileGesture,
  pointerCentredScroll,
  shouldPanWithSpace,
  viewportShortcut,
  zoomLabel,
  zoomStep,
} from "@/core/viewport/viewport";

const keyEvent = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  code: key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  target: null,
  ...overrides,
}) as Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "target">;

describe("shared viewport math", () => {
  it("clamps zoom to the supported limits", () => {
    expect(clampScale(0)).toBe(MIN_VIEWPORT_SCALE);
    expect(clampScale(20)).toBe(MAX_VIEWPORT_SCALE);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it("uses fit scale for Fit and actual pixel scale for 100%", () => {
    expect(effectiveScale("fit", 0.42)).toBe(0.42);
    expect(effectiveScale(1, 0.42)).toBe(1);
    expect(zoomLabel("fit", 0.42)).toBe("Fit");
    expect(zoomLabel(1.5, 0.42)).toBe("150%");
  });

  it("steps predictably and returns to Fit near the fit scale", () => {
    expect(zoomStep("fit", 0.5, 1)).toBe(0.625);
    expect(zoomStep(0.625, 0.5, -1)).toBe("fit");
  });

  it("keeps the same world coordinate beneath the pointer", () => {
    const beforeWorld = (120 + 80) / 1;
    const afterScroll = pointerCentredScroll(120, 80, 1, 2);
    const afterWorld = (afterScroll + 80) / 2;
    expect(afterScroll).toBe(320);
    expect(afterWorld).toBe(beforeWorld);
  });

  it("clamps pan to the scrollable bounds", () => {
    expect(clampPan(-20, 1000, 400)).toBe(0);
    expect(clampPan(250, 1000, 400)).toBe(250);
    expect(clampPan(900, 1000, 400)).toBe(600);
    expect(clampPan(20, 300, 400)).toBe(0);
  });
});

describe("shared viewport interaction rules", () => {
  it.each([
    ["0", "fit"],
    ["1", "actual"],
    ["+", "zoom-in"],
    ["=", "zoom-in"],
    ["-", "zoom-out"],
    ["Escape", "cancel"],
  ])("maps %s to %s", (key, action) => {
    expect(viewportShortcut(keyEvent(key))).toBe(action);
  });

  it("does not hijack modified shortcuts", () => {
    expect(viewportShortcut(keyEvent("1", { ctrlKey: true }))).toBeNull();
    expect(viewportShortcut(keyEvent("+", { metaKey: true }))).toBeNull();
    expect(viewportShortcut(keyEvent("-", { altKey: true }))).toBeNull();
  });

  it("pans with Space only outside typing and native interactive controls", () => {
    class TestElement extends EventTarget {
      tagName: string;
      type = "";
      isContentEditable = false;

      constructor(tagName: string, private readonly interactive: boolean) {
        super();
        this.tagName = tagName;
      }

      closest() {
        return this.interactive ? this : null;
      }
    }
    vi.stubGlobal("HTMLElement", TestElement);
    try {
      expect(shouldPanWithSpace(new TestElement("BUTTON", true))).toBe(false);
      expect(shouldPanWithSpace(new TestElement("INPUT", false))).toBe(false);
      expect(shouldPanWithSpace(new TestElement("DIV", false))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gives two-finger gestures to the viewport and preserves edit ownership", () => {
    expect(ownsMobileGesture(2, true, false)).toBe("viewport");
    expect(ownsMobileGesture(1, true, true)).toBe("editor");
    expect(ownsMobileGesture(1, false, true)).toBe("viewport");
    expect(ownsMobileGesture(1, false, false)).toBe("page");
  });
});
