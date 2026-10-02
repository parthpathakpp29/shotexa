import { CompareLanding } from "@/components/tools/compare/compare-landing";
import { CompareTool } from "@/components/tools/compare/compare-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("compare");

export default function CompareScreenshotsPage() {
  return <CompareTool landing={<CompareLanding />} />;
}
