import { PrivacyLanding } from "@/components/tools/redaction/privacy-landing";
import { RedactionTool } from "@/components/tools/redaction/redaction-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("blur");

export default function BlurScreenshotPage() {
  return <RedactionTool tool="blur" defaultMode="blur" landing={<PrivacyLanding tool="blur" />} />;
}
