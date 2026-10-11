import { SiteFooter } from "@/components/site/site-footer";
import { WorkflowsApp } from "@/components/workflows/workflows-app";
import { WorkflowsExplainer } from "@/components/workflows/workflows-explainer";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/workflows");

export default function WorkflowsPage() {
  return <WorkflowsApp explainer={<WorkflowsExplainer />} footer={<SiteFooter />} />;
}
