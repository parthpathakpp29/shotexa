import { StitchLanding } from "@/components/tools/stitch/stitch-landing";
import { StitchTool } from "@/components/tools/stitch/stitch-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("stitch");

export default function StitchScreenshotsPage() {
  return <StitchTool landing={<StitchLanding />} />;
}
