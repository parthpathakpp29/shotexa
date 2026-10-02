"use client";

import { useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { SiteHeader } from "./site-header";

/** Marketing header inside the workspace group: "Choose screenshots" opens the shared picker. */
export function WorkspaceSiteHeader() {
  const { openPicker } = useWorkspaceContext();
  return <SiteHeader onChoose={openPicker} />;
}
