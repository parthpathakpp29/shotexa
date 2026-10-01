/**
 * Phase 2L Beautifier — composition maths: canvas sizes, padding, radii, shadow, scale and
 * position, browser and phone frame geometry, contain/crop fitting, presets and settings
 * clamping. The pixels these numbers produce are verified in the browser E2E suite.
 */
import { describe, expect, it } from "vitest";
import { gradientLine, roundedRectPath } from "@/core/beautify/draw";
import { beautifyLayout, beautifySize, browserChrome, canvasFor, clampSettings, naturalComposition, phoneBezel, phoneOpening, withMode } from "@/core/beautify/layout";
import { DEFAULT_BEAUTIFY, MAX_RADIUS_RATIO, PHONE_SCREEN_RATIO, SHADOW_BLUR } from "@/core/beautify/presets";
import type { BeautifySettings } from "@/core/beautify/types";

const PHONE = { width: 1170, height: 2532 };
const DESKTOP = { width: 2400, height: 1350 };
const s = (over: Partial<BeautifySettings> = {}): BeautifySettings => ({ ...DEFAULT_BEAUTIFY, ...over });
const aspect = (r: { width: number; height: number }) => r.width / r.height;

describe("clean mode and padding", () => {
  it("wraps the screenshot in padding that scales with the image", () => {
    const l = beautifyLayout(s({ padding: 10, shadow: "none" }), PHONE);
    const pad = Math.round(0.1 * 1170); // 10 % of the composition's short side
    expect(l.canvas).toEqual({ width: 1170 + pad * 2, height: 2532 + pad * 2 });
    expect(l.content).toEqual({ x: pad, y: pad, width: 1170, height: 2532 });
    expect(l.screen).toEqual(l.content); // clean mode: the content is the screenshot
    expect(l.image).toEqual(l.screen);
    expect(l.sourceRect).toEqual({ x: 0, y: 0, width: 1170, height: 2532 });
    expect(l.zoom).toBe(1); // drawn at native resolution

    // The same percentage on a smaller screenshot gives proportionally smaller padding.
    const small = beautifyLayout(s({ padding: 10 }), { width: 400, height: 300 });
    expect(small.canvas).toEqual({ width: 400 + 60, height: 300 + 60 });
  });

  it("padding of zero gives a canvas the size of the screenshot", () => {
    const l = beautifyLayout(s({ padding: 0 }), PHONE);
    expect(l.canvas).toEqual(PHONE);
    expect(l.content).toMatchObject({ x: 0, y: 0, ...PHONE });
  });

  it("beautifySize agrees with the full layout", () => {
    for (const preset of ["auto", "1:1", "16:9", "square-1080"] as const) {
      const settings = s({ preset, mode: preset === "16:9" ? "browser" : "clean" });
      expect(beautifySize(settings, PHONE)).toEqual(beautifyLayout(settings, PHONE).canvas);
    }
  });
});

describe("scale and position", () => {
  it("scale shrinks the composition and leaves more background", () => {
    const full = beautifyLayout(s({ padding: 10, scale: 1 }), PHONE);
    const half = beautifyLayout(s({ padding: 10, scale: 0.5 }), PHONE);
    expect(half.canvas).toEqual(full.canvas); // the canvas does not move
    expect(half.content.width).toBe(585);
    expect(half.content.height).toBe(1266);
    expect(aspect(half.content)).toBeCloseTo(aspect(full.content), 2);
  });

  it("position never lets the composition leave the canvas", () => {
    for (const [ox, oy] of [
      [-1, -1],
      [1, 1],
      [-5, 5],
      [0.3, -0.7],
    ]) {
      const l = beautifyLayout(s({ padding: 12, scale: 0.6, offsetX: ox, offsetY: oy }), PHONE);
      expect(l.content.x).toBeGreaterThanOrEqual(0);
      expect(l.content.y).toBeGreaterThanOrEqual(0);
      expect(l.content.x + l.content.width).toBeLessThanOrEqual(l.canvas.width);
      expect(l.content.y + l.content.height).toBeLessThanOrEqual(l.canvas.height);
    }
    // Centred by default, hard left/top at −1.
    const centred = beautifyLayout(s({ padding: 12, scale: 0.6 }), PHONE);
    const free = centred.canvas.width - centred.content.width;
    expect(centred.content.x).toBe(Math.round(free / 2));
    expect(beautifyLayout(s({ padding: 12, scale: 0.6, offsetX: -1 }), PHONE).content.x).toBe(0);
    expect(beautifyLayout(s({ padding: 12, scale: 0.6, offsetX: 1 }), PHONE).content.x).toBe(free);
  });

  it("clamps settings to their supported ranges", () => {
    const c = clampSettings(s({ padding: 99, radius: -20, scale: 9, offsetX: -4, background: { kind: "solid", color: "red", color2: "#ABCDEF", angle: 45 } }));
    expect(c).toMatchObject({ padding: 40, radius: 0, scale: 1, offsetX: -1 });
    expect(c.background).toMatchObject({ color: "#f7f1e3", color2: "#abcdef" });
    expect(clampSettings(s({ scale: 0.1 })).scale).toBe(0.4);
  });
});

describe("corners and shadow", () => {
  it("corner radius is a share of the screenshot and scales with it", () => {
    const l = beautifyLayout(s({ radius: 100, padding: 0 }), PHONE);
    expect(l.radius).toBe(Math.round(MAX_RADIUS_RATIO * 1170));
    expect(l.screenRadii).toEqual([l.radius, l.radius, l.radius, l.radius]);
    expect(beautifyLayout(s({ radius: 50, padding: 0 }), PHONE).radius).toBe(Math.round(0.5 * MAX_RADIUS_RATIO * 1170));
    expect(beautifyLayout(s({ radius: 0 }), PHONE).radius).toBe(0);
    // Half the scale, half the radius: the look is identical at any output size.
    expect(beautifyLayout(s({ radius: 100, padding: 0, scale: 0.5 }), PHONE).radius).toBe(Math.round(MAX_RADIUS_RATIO * 585));
  });

  it("shadow scales with the composition and 'none' means none", () => {
    const medium = beautifyLayout(s({ shadow: "medium", padding: 10 }), PHONE);
    expect(medium.shadow).toEqual({ blur: Math.round(SHADOW_BLUR.medium * 1170), offsetY: Math.round(Math.round(SHADOW_BLUR.medium * 1170) * 0.35), color: expect.any(String) });
    expect(beautifyLayout(s({ shadow: "none" }), PHONE).shadow).toBeNull();
    expect(beautifyLayout(s({ shadow: "strong" }), PHONE).shadow!.blur).toBeGreaterThan(medium.shadow!.blur);
    // Shadow blur is proportional, so a half-size composition gets a half-size shadow.
    expect(beautifyLayout(s({ shadow: "medium", padding: 10, scale: 0.5 }), PHONE).shadow!.blur).toBe(Math.round(SHADOW_BLUR.medium * 585));
  });

  it("radius can never exceed half the box", () => {
    const l = beautifyLayout(s({ radius: 100, mode: "clean" }), { width: 40, height: 2000 });
    expect(l.radius).toBeLessThanOrEqual(20);
    expect(Math.max(...l.screenRadii)).toBeLessThanOrEqual(20);
  });
});

describe("browser frame", () => {
  it("adds a chrome strip above the screenshot and nothing else", () => {
    const natural = naturalComposition(s({ mode: "browser" }), PHONE);
    const chrome = browserChrome(1170);
    expect(chrome).toBe(Math.round(1170 * 0.055));
    expect(natural.size).toEqual({ width: 1170, height: 2532 + chrome });
    expect(natural.screen).toEqual({ x: 0, y: chrome, width: 1170, height: 2532 });
    expect(natural.image).toEqual(natural.screen);
    expect(natural.sourceRect).toEqual({ x: 0, y: 0, width: 1170, height: 2532 });
    // Clamped for very small and very wide screenshots.
    expect(browserChrome(200)).toBe(28);
    expect(browserChrome(9000)).toBe(120);
  });

  it("places window dots and an address pill inside the chrome", () => {
    const l = beautifyLayout(s({ mode: "browser", padding: 0, browser: { theme: "light", showAddress: true, address: " shotexa.app " } }), PHONE);
    expect(l.frame?.kind).toBe("browser");
    const frame = l.frame as Extract<typeof l.frame, { kind: "browser" }>;
    expect(frame.dots).toHaveLength(3);
    for (const dot of frame.dots) {
      expect(dot.cy).toBeCloseTo(l.content.y + frame.chrome / 2, 5);
      expect(dot.cx).toBeGreaterThan(l.content.x);
      expect(dot.cx + dot.r).toBeLessThan(l.content.x + l.content.width);
    }
    expect(frame.dots[1].cx).toBeGreaterThan(frame.dots[0].cx);
    expect(frame.address).toMatchObject({ text: "shotexa.app" }); // trimmed, never from the image
    expect(frame.address!.x).toBeGreaterThan(frame.dots[2].cx + frame.dots[2].r);
    expect(frame.address!.x + frame.address!.width).toBeLessThanOrEqual(l.content.x + l.content.width);
    expect(frame.address!.y).toBeGreaterThanOrEqual(l.content.y);
    expect(frame.address!.y + frame.address!.height).toBeLessThanOrEqual(l.content.y + frame.chrome);
    // An empty address falls back to the neutral placeholder.
    const blank = beautifyLayout(s({ mode: "browser", browser: { theme: "dark", showAddress: true, address: "   " } }), PHONE);
    expect((blank.frame as Extract<typeof l.frame, { kind: "browser" }>).address!.text).toBe("example.com");
    expect((beautifyLayout(s({ mode: "browser", browser: { theme: "light", showAddress: false, address: "x" } }), PHONE).frame as Extract<typeof l.frame, { kind: "browser" }>).address).toBeNull();
  });

  it("squares the screenshot against the chrome and rounds the window's bottom", () => {
    const l = beautifyLayout(s({ mode: "browser", radius: 100, padding: 0 }), PHONE);
    expect(l.screenRadii[0]).toBe(0);
    expect(l.screenRadii[1]).toBe(0);
    expect(l.screenRadii[2]).toBe(l.radius);
    expect(l.screenRadii[3]).toBe(l.radius);
  });
});

describe("phone frame", () => {
  it("uses a 9:19.5 opening inside a bezel", () => {
    const opening = phoneOpening(PHONE, "cover");
    expect(opening.width / opening.height).toBeCloseTo(PHONE_SCREEN_RATIO, 3);
    const bezel = phoneBezel(opening);
    const natural = naturalComposition(s({ mode: "phone" }), PHONE);
    expect(natural.size).toEqual({ width: opening.width + bezel * 2, height: opening.height + bezel * 2 });
    expect(natural.screen).toMatchObject({ x: bezel, y: bezel, width: opening.width, height: opening.height });
  });

  it("cover crops a centred region; contain shows the whole screenshot", () => {
    // A desktop screenshot is far wider than a phone screen.
    const cover = naturalComposition(s({ mode: "phone", phone: { theme: "dark", fit: "cover" } }), DESKTOP);
    expect(cover.sourceRect.width).toBeLessThan(DESKTOP.width); // cropped left and right
    expect(cover.sourceRect.height).toBe(DESKTOP.height);
    expect(cover.sourceRect.x).toBe(Math.round((DESKTOP.width - cover.sourceRect.width) / 2));
    expect(aspect(cover.image)).toBeCloseTo(aspect(cover.sourceRect), 2);
    expect(cover.image).toEqual(cover.screen); // the screenshot fills the screen

    const contain = naturalComposition(s({ mode: "phone", phone: { theme: "dark", fit: "contain" } }), DESKTOP);
    expect(contain.sourceRect).toEqual({ x: 0, y: 0, ...DESKTOP }); // nothing cropped
    expect(contain.image.width).toBe(DESKTOP.width);
    expect(contain.image.height).toBe(DESKTOP.height);
    // The screen opening keeps the device's shape; the screenshot is letterboxed on it.
    expect(aspect(contain.screen)).toBeCloseTo(PHONE_SCREEN_RATIO, 2);
    expect(contain.image.y).toBeGreaterThan(contain.screen.y);
    expect(contain.size.height).toBeGreaterThan(contain.size.width); // letterboxed in a tall phone
  });

  it("a phone-shaped screenshot fills the screen almost exactly", () => {
    const l = beautifyLayout(s({ mode: "phone", padding: 0 }), PHONE);
    expect(l.zoom).toBeCloseTo(1, 2);
    expect(l.sourceRect.width).toBeGreaterThan(PHONE.width * 0.99);
    expect(l.screen.width).toBeGreaterThan(l.content.width * 0.9);
    expect(l.image).toEqual(l.screen);
  });

  it("gives the device its own rounding, independent of the radius control", () => {
    const a = beautifyLayout(s({ mode: "phone", radius: 0, padding: 0 }), PHONE);
    const b = beautifyLayout(s({ mode: "phone", radius: 100, padding: 0 }), PHONE);
    expect(a.radius).toBe(b.radius);
    expect(a.radius).toBeGreaterThan(a.screenRadii[0]); // the shell is rounder than the screen
    expect((a.frame as Extract<typeof a.frame, { kind: "phone" }>).notch.width).toBeGreaterThan(0);
  });
});

describe("never distorts the screenshot", () => {
  it("the drawn rectangle always has the aspect ratio of the pixels it shows", () => {
    const sources = [PHONE, DESKTOP, { width: 1000, height: 1000 }, { width: 3000, height: 400 }, { width: 320, height: 5000 }];
    const settings: BeautifySettings[] = [
      s(),
      s({ mode: "browser" }),
      s({ mode: "phone" }),
      s({ mode: "phone", phone: { theme: "light", fit: "contain" } }),
      s({ preset: "1:1" }),
      s({ preset: "16:9", mode: "browser" }),
      s({ preset: "square-1080", scale: 0.8 }),
      s({ preset: "landscape-1200", mode: "phone" }),
      s({ padding: 30, scale: 0.4, offsetX: 1, offsetY: -1 }),
    ];
    for (const source of sources) {
      for (const setting of settings) {
        const l = beautifyLayout(setting, source);
        const label = `${setting.mode}/${setting.preset} ${source.width}×${source.height}`;
        expect(aspect(l.image), label).toBeCloseTo(aspect(l.sourceRect), 1);
        // And it stays inside the canvas.
        expect(l.image.x, label).toBeGreaterThanOrEqual(-1);
        expect(l.image.x + l.image.width, label).toBeLessThanOrEqual(l.canvas.width + 1);
        expect(l.image.y + l.image.height, label).toBeLessThanOrEqual(l.canvas.height + 1);
        expect(l.sourceRect.x + l.sourceRect.width, label).toBeLessThanOrEqual(source.width);
        expect(l.sourceRect.y + l.sourceRect.height, label).toBeLessThanOrEqual(source.height);
      }
    }
  });
});

describe("output presets", () => {
  it("ratio presets grow the canvas to the ratio and never crop the composition", () => {
    for (const [preset, ratio] of [
      ["1:1", 1],
      ["4:3", 4 / 3],
      ["16:9", 16 / 9],
    ] as const) {
      const l = beautifyLayout(s({ preset, padding: 8 }), PHONE);
      expect(aspect(l.canvas)).toBeCloseTo(ratio, 2);
      expect(l.canvas.width).toBeGreaterThanOrEqual(l.content.width);
      expect(l.canvas.height).toBeGreaterThanOrEqual(l.content.height);
      expect(l.content.height).toBe(2532); // a tall screenshot keeps its pixels; the canvas widens
    }
  });

  it("fixed presets produce exactly those dimensions, fitting the composition inside", () => {
    const square = beautifyLayout(s({ preset: "square-1080", padding: 10 }), PHONE);
    expect(square.canvas).toEqual({ width: 1080, height: 1080 });
    expect(square.content.height).toBeLessThanOrEqual(1080 - 2 * 108);
    expect(aspect(square.content)).toBeCloseTo(aspect(PHONE), 1);

    const landscape = beautifyLayout(s({ preset: "landscape-1200", mode: "browser" }), DESKTOP);
    expect(landscape.canvas).toEqual({ width: 1200, height: 630 });
    expect(landscape.content.width).toBeLessThanOrEqual(1200);
    expect(landscape.content.height).toBeLessThanOrEqual(630);
  });

  it("padding for a fixed preset comes from the canvas, not the screenshot", () => {
    const { pad } = canvasFor(s({ preset: "square-1080", padding: 10 }), { width: 4000, height: 3000 });
    expect(pad).toBe(108);
  });
});

describe("background and drawing helpers", () => {
  it("maps each gradient angle to a line across the canvas", () => {
    expect(gradientLine(0, 100, 50)).toEqual([0, 0, 0, 50]);
    expect(gradientLine(45, 100, 50)).toEqual([0, 0, 100, 50]);
    expect(gradientLine(90, 100, 50)).toEqual([0, 0, 100, 0]);
    expect(gradientLine(135, 100, 50)).toEqual([0, 50, 100, 0]);
  });

  it("carries the background through to the layout", () => {
    const l = beautifyLayout(s({ background: { kind: "gradient", color: "#112233", color2: "#445566", angle: 90 } }), PHONE);
    expect(l.background).toEqual({ kind: "gradient", color: "#112233", color2: "#445566", angle: 90 });
  });

  it("draws a rounded rectangle without exceeding half the box", () => {
    const calls: string[] = [];
    const ctx = {
      beginPath: () => calls.push("begin"),
      moveTo: (...a: number[]) => calls.push(`move ${a.join(",")}`),
      lineTo: (...a: number[]) => calls.push(`line ${a.join(",")}`),
      arcTo: (...a: number[]) => calls.push(`arc ${a.join(",")}`),
      closePath: () => calls.push("close"),
    } as unknown as CanvasRenderingContext2D;
    roundedRectPath(ctx, { x: 0, y: 0, width: 100, height: 40 }, [999, 0, 0, 0]);
    expect(calls[1]).toBe("move 20,0"); // clamped to half the short side
    expect(calls.filter((c) => c.startsWith("arc"))).toHaveLength(4);
  });
});

describe("modes", () => {
  it("switching mode applies that mode's frame defaults, and back again", () => {
    const clean = s({ radius: 10, shadow: "none" });
    const browser = withMode(clean, "browser");
    expect(browser).toMatchObject({ mode: "browser", radius: 40, shadow: "medium" });
    expect(withMode(browser, "browser")).toBe(browser); // no change, no new object
    expect(withMode(browser, "phone")).toMatchObject({ mode: "phone", shadow: "strong" });
    // Everything else is kept.
    expect(withMode(clean, "phone").background).toEqual(clean.background);
  });
});
