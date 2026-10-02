import { AnnotateLanding } from "@/components/tools/annotate/annotate-landing";
import { AnnotateTool } from "@/components/tools/annotate/annotate-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("annotate");

export default function AnnotateScreenshotPage() {
  return <AnnotateTool landing={<AnnotateLanding />} />;
}
