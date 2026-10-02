import { BatchLanding } from "@/components/tools/batch/batch-landing";
import { BatchTool } from "@/components/tools/batch/batch-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("batch");

export default function BatchScreenshotsPage() {
  return <BatchTool landing={<BatchLanding />} />;
}
