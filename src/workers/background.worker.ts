/// <reference lib="webworker" />
/** Dedicated lazy worker for U²-Net-P inference and mask composition. */
import { segmentImage } from "@/core/background-removal/inference";
import { renderRemovedBackground } from "@/core/background-removal/render";
import { BackgroundRemovalError } from "@/core/background-removal/types";
import { serveWorker, type WorkerErrorCode } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

serveWorker(
  self,
  {
    "background.remove": ({ image }, ctx) => segmentImage(image, self.location.origin, ctx.signal, (stage) => ctx.progress(0, stage)),
    "background.export": ({ image, source, mask, settings, format, quality, backgroundImage }, ctx) =>
      renderRemovedBackground(image, { source, mask, settings, format, quality, backgroundImage, signal: ctx.signal }),
  },
  (error): WorkerErrorCode => error instanceof BackgroundRemovalError ? error.code : error instanceof RangeError ? "BACKGROUND_MEMORY_PRESSURE" : "BACKGROUND_INFERENCE_FAILED",
  (op, output) => op === "background.remove" ? [(output as { mask: Uint8ClampedArray }).mask.buffer] : [],
);
