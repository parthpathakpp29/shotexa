import type { Size } from "@/core/image-transform/types";
import type { BackgroundPaint } from "./types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Motif = "orbits" | "ribbons" | "facets" | "arches" | "sun" | "botanical" | "mist" | "glass" | "gallery" | "waves" | "spotlight" | "horizon" | "embers" | "bloom" | "grid" | "folds" | "chrome" | "ripples";
type Art = { id: string; colors: [string, string, string]; motif: Motif; ink: string; light: string };

/** Every entry is vector artwork made for Shotexa; no network or raster assets are involved. */
export const STUDIO_ART: readonly Art[] = [
  { id: "orbit-ink", colors: ["#080d25", "#222264", "#4e3cc8"], motif: "orbits", ink: "#9992ff", light: "#6a72ff" },
  { id: "nebula-glow", colors: ["#130b24", "#492163", "#bd4183"], motif: "ribbons", ink: "#f7a8d6", light: "#e767ba" },
  { id: "prism-haze", colors: ["#d5eafb", "#a9bded", "#dfc4ee"], motif: "facets", ink: "#687dc8", light: "#ffffff" },
  { id: "copper-flow", colors: ["#552822", "#aa583d", "#efb980"], motif: "arches", ink: "#ffd4a4", light: "#f29a62" },
  { id: "paper-sun", colors: ["#fffaf0", "#f4e7d3", "#e9c6a6"], motif: "sun", ink: "#bf835d", light: "#ffe0af" },
  { id: "moss-light", colors: ["#092d2b", "#285c4c", "#84a882"], motif: "botanical", ink: "#bad3a5", light: "#98cbae" },
  { id: "sage-mist", colors: ["#f1f4e9", "#cfdfd0", "#a9c6b9"], motif: "mist", ink: "#72998b", light: "#ffffff" },
  { id: "frosted-blue", colors: ["#d8eff7", "#a3d3e5", "#80afd1"], motif: "glass", ink: "#5c9fc3", light: "#ffffff" },
  { id: "gallery-white", colors: ["#fbfaf6", "#f4f0e8", "#e6e0d7"], motif: "gallery", ink: "#b6a899", light: "#ffffff" },
  { id: "soft-lilac", colors: ["#f9eafa", "#d5c8f4", "#f4bdce"], motif: "waves", ink: "#ad87c4", light: "#fff7fd" },
  { id: "nocturne", colors: ["#0d101a", "#202636", "#394351"], motif: "spotlight", ink: "#8292a5", light: "#aab9d0" },
  { id: "stage-sand", colors: ["#f8eddf", "#e6cfb5", "#c6a989"], motif: "horizon", ink: "#aa8d75", light: "#fff8ee" },
  { id: "ember-theatre", colors: ["#271519", "#683234", "#bf5f42"], motif: "embers", ink: "#ffd3a3", light: "#fa8c61" },
  { id: "citrus-bloom", colors: ["#fff3d1", "#f9ca74", "#ed865a"], motif: "bloom", ink: "#ae694a", light: "#fff6c8" },
  { id: "blueprint", colors: ["#10293b", "#1c526d", "#2b7d8d"], motif: "grid", ink: "#8cc7d2", light: "#b1f2ec" },
  { id: "peach-veil", colors: ["#fcf0e9", "#eec2b9", "#c994a5"], motif: "folds", ink: "#bd7b83", light: "#fff7e9" },
  { id: "chrome-night", colors: ["#0b0b15", "#262637", "#555b78"], motif: "chrome", ink: "#a6c9e4", light: "#e7f2ff" },
  { id: "ultramarine", colors: ["#14285b", "#265eaa", "#4daebc"], motif: "ripples", ink: "#b7e5f3", light: "#80d9ed" },
];

const artById = new Map(STUDIO_ART.map((entry) => [entry.id, entry]));

function glow(ctx: Ctx, x: number, y: number, radius: number, color: string, alpha: number, w: number, h: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), rotation, 0, Math.PI * 2);
}

function curve(ctx: Ctx, points: [number, number, number, number, number, number, number, number]) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  ctx.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]);
}

function artMotif(ctx: Ctx, art: Art, w: number, h: number, u: number) {
  ctx.save();
  ctx.strokeStyle = art.ink;
  ctx.fillStyle = art.light;
  ctx.lineWidth = Math.max(1, u * 0.002);
  switch (art.motif) {
    case "orbits": {
      glow(ctx, w * 0.82, h * 0.18, u * 0.78, art.light, 0.43, w, h);
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.13 + i * 0.055;
        ellipse(ctx, w * 0.85, h * 0.2, u * (0.18 + i * 0.09), u * (0.18 + i * 0.09));
        ctx.stroke();
      }
      ctx.globalAlpha = 0.38;
      ellipse(ctx, w * 0.85, h * 0.2, u * 0.18, u * 0.18);
      ctx.fill();
      break;
    }
    case "ribbons": {
      glow(ctx, w * 0.14, h * 0.2, u * 0.75, art.light, 0.36, w, h);
      for (let i = 0; i < 7; i++) {
        const d = i * u * 0.075;
        ctx.globalAlpha = 0.11 + i * 0.028;
        ctx.lineWidth = u * (0.026 - i * 0.002);
        curve(ctx, [-w * 0.22, h * 0.75 + d, w * 0.18, -h * 0.32 + d, w * 0.68, h * 0.82 + d, w * 1.22, h * 0.1 + d]);
        ctx.stroke();
      }
      break;
    }
    case "facets": {
      const facets: [number, number][] = [[0.68,-0.12],[1.1,0.04],[0.95,0.47],[1.17,0.73],[0.78,0.91],[0.59,0.54]];
      for (let i = 0; i < facets.length - 2; i++) {
        ctx.globalAlpha = 0.08 + i * 0.035;
        ctx.beginPath(); ctx.moveTo(w * facets[0][0], h * facets[0][1]);
        ctx.lineTo(w * facets[i+1][0], h * facets[i+1][1]);
        ctx.lineTo(w * facets[i+2][0], h * facets[i+2][1]); ctx.closePath();
        ctx.fill(); ctx.globalAlpha = 0.3; ctx.stroke();
      }
      glow(ctx, w * 0.12, h * 0.88, u * 0.6, "#ffffff", 0.65, w, h);
      break;
    }
    case "arches": {
      for (let i = 0; i < 7; i++) {
        ctx.globalAlpha = 0.14 + i * 0.025;
        ctx.lineWidth = u * (0.008 + i * 0.001);
        ctx.beginPath(); ctx.arc(w * 1.03, h * 1.08, u * (0.23 + i * 0.12), Math.PI * 0.87, Math.PI * 1.72); ctx.stroke();
      }
      glow(ctx, w * 0.04, h * 0.14, u * 0.63, art.light, 0.29, w, h);
      break;
    }
    case "sun": {
      ctx.globalAlpha = 0.4; ellipse(ctx, w * 0.87, h * 0.16, u * 0.28, u * 0.28); ctx.fill();
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.12 + i * 0.017;
        curve(ctx, [-w * 0.1, h * (0.74 + i * 0.055), w * 0.28, h * (0.45 + i * 0.045), w * 0.7, h * (1.08 + i * 0.02), w * 1.1, h * (0.63 + i * 0.02)]);
        ctx.stroke();
      }
      break;
    }
    case "botanical": {
      for (let i = 0; i < 7; i++) {
        const a = i * 0.42;
        ctx.globalAlpha = 0.1 + i * 0.018;
        ellipse(ctx, w * (0.02 + i * 0.045), h * (0.09 + i * 0.125), u * 0.11, u * 0.3, -0.6 + a);
        ctx.fill();
        ellipse(ctx, w * (0.91 - i * 0.02), h * (0.97 - i * 0.12), u * 0.07, u * 0.22, 0.4 + a);
        ctx.stroke();
      }
      glow(ctx, w * 0.8, h * 0.2, u * 0.65, art.light, 0.22, w, h);
      break;
    }
    case "mist": {
      for (let i = 0; i < 5; i++) glow(ctx, w * (0.05 + i * 0.26), h * (i % 2 ? 0.8 : 0.2), u * 0.53, i % 2 ? art.ink : art.light, 0.2, w, h);
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.1;
        curve(ctx, [-w * 0.15, h * (0.35 + i * 0.11), w * 0.3, h * (0.24 + i * 0.11), w * 0.65, h * (0.46 + i * 0.11), w * 1.15, h * (0.29 + i * 0.11)]);
        ctx.stroke();
      }
      break;
    }
    case "glass": {
      glow(ctx, w * 0.8, h * 0.1, u * 0.72, art.light, 0.85, w, h);
      ctx.save(); ctx.translate(w * 0.77, h * 0.15); ctx.rotate(-0.35);
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = 0.08 + i * 0.055;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(i * u * 0.1, -u * 0.2, u * 0.19, h * 1.2);
        ctx.globalAlpha = 0.28; ctx.strokeRect(i * u * 0.1, -u * 0.2, u * 0.19, h * 1.2);
      }
      ctx.restore();
      break;
    }
    case "gallery": {
      ctx.globalAlpha = 0.32;
      ctx.strokeRect(u * 0.045, u * 0.045, w - u * 0.09, h - u * 0.09);
      ctx.globalAlpha = 0.17;
      for (let i = 0; i < 4; i++) { ctx.strokeRect(w * (0.73 + i * 0.035), h * (0.07 + i * 0.04), u * 0.24, u * 0.24); }
      break;
    }
    case "waves": {
      glow(ctx, w * 0.06, h * 0.1, u * 0.68, art.light, 0.7, w, h);
      for (let i = 0; i < 9; i++) {
        ctx.globalAlpha = 0.09 + i * 0.02;
        ctx.lineWidth = u * 0.013;
        curve(ctx, [-w * 0.2, h * (0.53 + i * 0.06), w * 0.28, h * (0.05 + i * 0.05), w * 0.7, h * (1.06 + i * 0.01), w * 1.2, h * (0.34 + i * 0.05)]);
        ctx.stroke();
      }
      break;
    }
    case "spotlight": {
      glow(ctx, w * 0.51, -h * 0.1, u * 0.9, art.light, 0.25, w, h);
      ctx.globalAlpha = 0.2;
      ctx.beginPath(); ctx.moveTo(w * 0.43, 0); ctx.lineTo(w * 0.8, 0); ctx.lineTo(w * 1.1, h); ctx.lineTo(w * 0.08, h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, h * (0.68 + i * 0.045)); ctx.lineTo(w, h * (0.68 + i * 0.045)); ctx.stroke(); }
      break;
    }
    case "horizon": {
      glow(ctx, w * 0.22, h * 0.15, u * 0.56, art.light, 0.83, w, h);
      ctx.globalAlpha = 0.24; ellipse(ctx, w * 0.87, h * 0.16, u * 0.22, u * 0.22); ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.globalAlpha = 0.12 + i * 0.018;
        curve(ctx, [-w * 0.1, h * (0.68 + i * 0.04), w * 0.3, h * (0.56 + i * 0.06), w * 0.61, h * (0.93 + i * 0.01), w * 1.1, h * (0.58 + i * 0.05)]); ctx.stroke();
      }
      break;
    }
    case "embers": {
      glow(ctx, w * 0.78, h * 0.84, u * 0.7, art.light, 0.48, w, h);
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 0.16 + i * 0.035; ctx.lineWidth = u * 0.018;
        curve(ctx, [w * (0.55 + i * 0.08), h * 1.14, w * (0.25 + i * 0.11), h * 0.64, w * (1.17 - i * 0.04), h * 0.46, w * (0.77 + i * 0.07), -h * 0.17]); ctx.stroke();
      }
      break;
    }
    case "bloom": {
      glow(ctx, w * 0.82, h * 0.2, u * 0.7, art.light, 0.68, w, h);
      for (let i = 0; i < 10; i++) {
        ctx.save(); ctx.translate(w * 0.87, h * 0.13); ctx.rotate((i * Math.PI) / 5);
        ctx.globalAlpha = 0.08 + (i % 3) * 0.045; ellipse(ctx, 0, u * 0.28, u * 0.12, u * 0.3); ctx.fill(); ctx.restore();
      }
      break;
    }
    case "grid": {
      ctx.globalAlpha = 0.16;
      const gap = Math.max(18, u * 0.07);
      for (let x = 0; x < w; x += gap) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.globalAlpha = 0.33; ctx.lineWidth = u * 0.006;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(w * 0.83, h * 0.15, u * (0.12 + i * 0.08), 0, Math.PI * 2); ctx.stroke(); }
      break;
    }
    case "folds": {
      glow(ctx, w * 0.08, h * 0.13, u * 0.55, art.light, 0.78, w, h);
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.08 + i * 0.035;
        ctx.beginPath(); ctx.moveTo(w * (0.56 + i * 0.1), -h * 0.1);
        ctx.bezierCurveTo(w * (0.84 + i * 0.06), h * 0.3, w * (0.38 + i * 0.12), h * 0.66, w * (0.82 + i * 0.1), h * 1.1);
        ctx.lineTo(w * (1 + i * 0.1), h * 1.1); ctx.lineTo(w * (0.76 + i * 0.1), -h * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      break;
    }
    case "chrome": {
      glow(ctx, w * 0.9, h * 0.1, u * 0.75, art.light, 0.26, w, h);
      for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.13 + i * 0.06; ctx.lineWidth = u * (0.005 + i * 0.004);
        ellipse(ctx, w * 0.87, h * 0.18, u * (0.14 + i * 0.11), u * (0.28 + i * 0.13), -0.42); ctx.stroke();
      }
      break;
    }
    case "ripples": {
      glow(ctx, w * 0.09, h * 0.8, u * 0.7, art.light, 0.33, w, h);
      for (let i = 0; i < 9; i++) {
        ctx.globalAlpha = 0.1 + i * 0.026;
        ellipse(ctx, w * 0.86, h * 0.04, u * (0.13 + i * 0.08), u * (0.09 + i * 0.1), -0.18); ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

export function paintStudioArt(ctx: Ctx, canvas: Size, background: BackgroundPaint): void {
  const art = artById.get(background.studioId ?? "");
  const w = canvas.width, h = canvas.height;
  if (!art) { ctx.fillStyle = background.color; ctx.fillRect(0, 0, w, h); return; }
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, background.color);
  gradient.addColorStop(0.55, art.colors[1]);
  gradient.addColorStop(1, background.color2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  const u = Math.min(w, h);
  glow(ctx, w * 0.06, h * 0.91, u * 0.61, art.light, 0.22, w, h);
  artMotif(ctx, art, w, h, u);
  // A restrained vignette keeps the screenshot the visual focus at every aspect ratio.
  const vignette = ctx.createRadialGradient(w * 0.5, h * 0.48, u * 0.13, w * 0.5, h * 0.48, Math.max(w, h) * 0.83);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}
