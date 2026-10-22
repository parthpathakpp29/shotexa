/// <reference lib="webworker" />
import { detectFaces } from "@/core/privacy/face-detect";
import { serveWorker, type WorkerErrorCode } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

serveWorker(self, {
  "privacy.faces": ({ image }, ctx) => detectFaces(image, self.location.origin, ctx.signal, (stage) => ctx.progress(0, stage)),
}, (): WorkerErrorCode => "FACE_DETECTION_FAILED");
