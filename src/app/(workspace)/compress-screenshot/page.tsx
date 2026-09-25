import { PreviewTool } from "@/components/tools/preview-tool";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { toolMetadata } from "@/config/routes";

// Not built yet (Phase 2+): workspace shell only, noindex, not in the sitemap.
export const metadata = toolMetadata("compress");

export default function CompressScreenshotPage() {
  return <PreviewTool tool="compress" landing={<ToolLanding tool="compress" />} />;
}
