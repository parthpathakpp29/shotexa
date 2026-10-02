import { EncodeLanding } from "@/components/tools/encode/encode-landing";
import { EncodeTool } from "@/components/tools/encode/encode-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("compress");

export default function CompressScreenshotPage() {
  return <EncodeTool tool="compress" landing={<EncodeLanding tool="compress" />} />;
}
