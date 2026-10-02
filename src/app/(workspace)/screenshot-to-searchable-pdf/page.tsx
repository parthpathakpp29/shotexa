import { PdfTool } from "@/components/tools/pdf/pdf-tool";
import { SearchablePdfLanding } from "@/components/tools/pdf/searchable-pdf-landing";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("searchable-pdf");

export default function ScreenshotToSearchablePdfPage() {
  return <PdfTool searchable landing={<SearchablePdfLanding />} />;
}
