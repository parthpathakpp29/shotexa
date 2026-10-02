import { BeautifyLanding } from "@/components/tools/beautify/beautify-landing";
import { BeautifyTool } from "@/components/tools/beautify/beautify-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("beautify");

export default function ScreenshotBeautifierPage() {
  return <BeautifyTool landing={<BeautifyLanding />} />;
}
