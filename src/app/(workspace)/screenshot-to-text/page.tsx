import { OcrLanding } from "@/components/tools/ocr/ocr-landing";
import { OcrTool } from "@/components/tools/ocr/ocr-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("extract-text");

export default function ScreenshotToTextPage() {
  return <OcrTool landing={<OcrLanding />} />;
}
