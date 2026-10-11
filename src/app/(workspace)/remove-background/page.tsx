import { BackgroundRemovalLanding } from "@/components/tools/background-removal/background-removal-landing";
import { BackgroundRemovalTool } from "@/components/tools/background-removal/background-removal-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("remove-background");

export default function RemoveBackgroundPage() { return <BackgroundRemovalTool landing={<BackgroundRemovalLanding />} />; }
