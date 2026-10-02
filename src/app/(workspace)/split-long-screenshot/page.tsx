import { SplitLanding } from "@/components/tools/split/split-landing";
import { SplitTool } from "@/components/tools/split/split-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("split");

export default function SplitLongScreenshotPage() {
  return <SplitTool landing={<SplitLanding />} />;
}
