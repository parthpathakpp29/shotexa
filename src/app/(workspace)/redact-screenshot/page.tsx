import { PreviewTool } from "@/components/tools/preview-tool";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { toolMetadata } from "@/config/routes";

// Not built yet (Phase 2+): workspace shell only, noindex, not in the sitemap.
export const metadata = toolMetadata("safe-share");

export default function RedactScreenshotPage() {
  return <PreviewTool tool="safe-share" landing={<ToolLanding tool="safe-share" />} />;
}
