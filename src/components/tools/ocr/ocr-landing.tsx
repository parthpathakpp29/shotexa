import { ToolLanding } from "@/components/workspace/tool-landing";

/** Uploader first, then the shared explanation from `config/tool-content.ts`. */
export function OcrLanding() {
  return <ToolLanding tool="extract-text" />;
}
