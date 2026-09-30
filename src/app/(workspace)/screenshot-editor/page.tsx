import { EditorLanding } from "@/components/tools/editor/editor-landing";
import { EditorTool } from "@/components/tools/editor/editor-tool";
import { toolMetadata } from "@/config/routes";

export const metadata = toolMetadata("editor");

export default function ScreenshotEditorPage() {
  return <EditorTool landing={<EditorLanding />} />;
}
