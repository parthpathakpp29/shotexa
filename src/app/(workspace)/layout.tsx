import { WorkspaceProvider } from "@/components/workspace/workspace-provider";

/**
 * One workspace for the homepage and every tool route: files survive client-side navigation
 * between them. Nothing is persisted — a full reload starts with an empty workspace.
 */
export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
