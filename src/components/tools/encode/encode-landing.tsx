import { ToolLanding } from "@/components/workspace/tool-landing";
import type { EncodeTool } from "@/core/image-encode/types";

/** Uploader first, then the shared explanation from `config/tool-content.ts`. */
export function EncodeLanding({ tool }: { tool: EncodeTool }) {
  return <ToolLanding tool={tool} />;
}
