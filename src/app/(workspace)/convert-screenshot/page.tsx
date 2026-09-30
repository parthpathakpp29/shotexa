import { EncodeLanding } from "@/components/tools/encode/encode-landing";
import { EncodeTool } from "@/components/tools/encode/encode-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("convert");

export default function ConvertScreenshotPage() {
  return <EncodeTool tool="convert" landing={<EncodeLanding tool="convert" />} />;
}
