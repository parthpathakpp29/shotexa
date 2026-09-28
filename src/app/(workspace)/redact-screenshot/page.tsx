import { PrivacyLanding } from "@/components/tools/redaction/privacy-landing";
import { RedactionTool } from "@/components/tools/redaction/redaction-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("safe-share");

export default function RedactScreenshotPage() {
  return <RedactionTool tool="safe-share" defaultMode="blackout" landing={<PrivacyLanding tool="safe-share" />} />;
}
