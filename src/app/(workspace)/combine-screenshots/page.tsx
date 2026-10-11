import { CombineTool } from "@/components/tools/combine/combine-tool";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("combine");

export default function CombineScreenshotsPage() {
  return <CombineTool landing={<ToolLanding tool="combine" />} />;
}
