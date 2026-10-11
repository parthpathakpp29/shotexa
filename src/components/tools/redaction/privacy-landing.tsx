import { ToolLanding } from "@/components/workspace/tool-landing";

/** Uploader first, then the shared explanation from `config/tool-content.ts`. */
export function PrivacyLanding({ tool }: { tool: "safe-share" | "blur" }) {
  return <ToolLanding tool={tool} />;
}
