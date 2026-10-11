import { StructuredDataLanding } from "@/components/tools/structured-data/structured-data-landing";
import { StructuredDataTool } from "@/components/tools/structured-data/structured-data-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("structured-data");
export default function ScreenshotToDataPage() { return <StructuredDataTool landing={<StructuredDataLanding />} />; }
