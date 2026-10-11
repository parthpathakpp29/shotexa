import type { AnimationPreset, BeautifyAnimation } from "./types";

export const ANIMATION_PRESETS: Record<AnimationPreset, BeautifyAnimation> = {
  none: { preset: "none", duration: 1800, easing: "ease-in-out", direction: "up", intensity: 40, loop: false },
  "fade-in": { preset: "fade-in", duration: 900, easing: "ease-out", direction: "up", intensity: 45, loop: false },
  "slide-up": { preset: "slide-up", duration: 1000, easing: "ease-out", direction: "up", intensity: 45, loop: false },
  "zoom-in": { preset: "zoom-in", duration: 1000, easing: "ease-out", direction: "up", intensity: 35, loop: false },
  float: { preset: "float", duration: 3200, easing: "ease-in-out", direction: "up", intensity: 35, loop: true },
  "slow-pan": { preset: "slow-pan", duration: 5000, easing: "linear", direction: "right", intensity: 25, loop: true },
  parallax: { preset: "parallax", duration: 3600, easing: "ease-in-out", direction: "right", intensity: 30, loop: true },
  tilt: { preset: "tilt", duration: 2800, easing: "ease-in-out", direction: "right", intensity: 30, loop: true },
  "rotate-3d": { preset: "rotate-3d", duration: 4200, easing: "ease-in-out", direction: "right", intensity: 40, loop: true },
  orbit: { preset: "orbit", duration: 4800, easing: "ease-in-out", direction: "right", intensity: 30, loop: true },
};

