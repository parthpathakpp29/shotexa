"use client";

import { Button } from "@/components/ui/button";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { useShortcutLabel } from "@/lib/use-shortcut-label";

export function ChooseScreenshotsButton() {
  const { openPicker } = useWorkspaceContext();
  const key = useShortcutLabel("O");
  return (
    <Button variant="primary" size="lg" kbd={key} onClick={openPicker}>
      Choose screenshots
    </Button>
  );
}
