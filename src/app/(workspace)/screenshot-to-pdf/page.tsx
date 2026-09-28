import { PdfLanding } from "@/components/tools/pdf/pdf-landing";
import { PdfTool } from "@/components/tools/pdf/pdf-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("pdf");

export default function ScreenshotToPdfPage() {
  return <PdfTool landing={<PdfLanding />} />;
}
