"use client";

/**
 * Shared desktop/mobile tool shell (architecture §19–20; screen2 is the reference):
 *   header  — logo · "Workspace / <tool switcher>" · status · primary export (⌘S)
 *   desktop — files (left) · canvas (center) · settings (right)
 *   mobile  — compact header · large canvas · files and settings in bottom sheets ·
 *             sticky Undo / Redo / Export bar with 44 px targets
 */
import { ChevronsUpDown, Download, Images, Loader2, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo, LogoMark, ToolIcon } from "@/components/brand";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { TOOLS, WORKSPACE_TABS, type ToolId } from "@/config/tools";
import { cn } from "@/lib/cn";
import { useShortcutLabel } from "@/lib/use-shortcut-label";
import { FileTray } from "./file-tray";
import { useWorkspace } from "./workspace-provider";

export interface ExportAction {
  label: string;
  onClick(): void;
  disabled?: boolean;
  busy?: boolean;
}

export function ToolSwitcher({ tool }: { tool: ToolId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = TOOLS[tool];
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink shadow-xs hover:border-line-strong max-md:h-11"
      >
        <ToolIcon name={t.icon} className="size-4 text-accent" />
        {t.name}
        <ChevronsUpDown aria-hidden className="size-3.5 text-ink-3" />
      </button>
      {open && (
        <div role="menu" aria-label="Switch tool" className="absolute left-0 top-full z-40 mt-2 w-60 rounded-lg border border-line bg-surface p-1.5 shadow-md">
          {[...new Set<ToolId>(["stitch", ...WORKSPACE_TABS, "combine", "compress", "editor"])].map((id) => (
            <Link
              key={id}
              role="menuitem"
              href={TOOLS[id].route}
              onClick={() => setOpen(false)}
              className={cn("flex min-h-10 items-center gap-2.5 rounded-sm px-2.5 text-sm hover:bg-surface-2", id === tool ? "text-accent-ink" : "text-ink")}
            >
              <ToolIcon name={TOOLS[id].icon} className="size-4" />
              {TOOLS[id].name}
              {TOOLS[id].status !== "live" && <span className="t-micro ml-auto text-[9.5px] text-ink-3">Soon</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkspaceHeader({ tool, status, exportAction }: { tool: ToolId; status?: ReactNode; exportAction?: ExportAction }) {
  const saveKey = useShortcutLabel("S");
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
      <div className="flex h-16 items-center gap-4 px-4 lg:px-6">
        <Logo className="max-md:hidden" />
        <Link href="/" aria-label="Shotexa home" className="md:hidden">
          <LogoMark />
        </Link>
        <span aria-hidden className="h-6 w-px bg-line max-md:hidden" />
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2">
          <Link href="/" className="font-display text-[17px] italic text-ink-2 hover:text-ink max-sm:hidden">
            Workspace
          </Link>
          <span aria-hidden className="text-ink-3 max-sm:hidden">
            /
          </span>
          <ToolSwitcher tool={tool} />
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {status && <div className="max-lg:hidden">{status}</div>}
          {exportAction && (
            <Button variant="primary" size="lg" kbd={saveKey} onClick={exportAction.onClick} disabled={exportAction.disabled || exportAction.busy} className="max-md:hidden" data-testid="export">
              {exportAction.busy ? <Loader2 className="animate-spin" /> : <Download />}
              {exportAction.label}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Undo/redo/export keyboard shortcuts for the active tool (inputs keep their native behaviour). */
function useToolShortcuts(exportAction?: ExportAction) {
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const exportRef = useRef(exportAction);
  useEffect(() => {
    exportRef.current = exportAction;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) && (e.target as HTMLInputElement).type !== "range";
      if (k === "s") {
        e.preventDefault();
        const a = exportRef.current;
        if (a && !a.disabled && !a.busy) a.onClick();
      } else if (!typing && k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!typing && k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
}

export function WorkspaceShell({
  tool,
  status,
  exportAction,
  fileHint,
  canvas,
  inspector,
  inspectorTitle = "Settings",
  below,
}: {
  tool: ToolId;
  status?: ReactNode;
  exportAction?: ExportAction;
  fileHint?: string;
  canvas: ReactNode;
  inspector: ReactNode;
  inspectorTitle?: string;
  below?: ReactNode;
}) {
  const [sheet, setSheet] = useState<"files" | "settings" | null>(null);
  const count = useWorkspace((s) => s.order.length);
  const canUndo = useWorkspace((s) => s.history.past.length > 0);
  const canRedo = useWorkspace((s) => s.history.future.length > 0);
  const undo = useWorkspace((s) => s.undo);
  const redo = useWorkspace((s) => s.redo);
  const setActiveTool = useWorkspace((s) => s.setActiveTool);
  useToolShortcuts(exportAction);
  useEffect(() => setActiveTool(tool), [tool, setActiveTool]);

  return (
    <div className="flex min-h-dvh flex-col">
      <WorkspaceHeader tool={tool} status={status} exportAction={exportAction} />
      <div className="mx-auto grid w-full max-w-[1480px] flex-1 grid-cols-1 gap-5 px-3 py-4 md:grid-cols-[232px_minmax(0,1fr)] md:px-5 md:py-6 lg:grid-cols-[232px_minmax(0,1fr)_264px] lg:gap-5 xl:grid-cols-[272px_minmax(0,1fr)_300px] xl:gap-6 max-md:pb-28">
        <aside className="hidden md:block">
          <div className="sticky top-22 rounded-lg border border-line bg-surface p-5 shadow-xs md:max-h-[calc(100dvh-7rem)] md:overflow-hidden">
            <FileTray hint={fileHint} className="md:max-h-[calc(100dvh-9.5rem)]" />
          </div>
        </aside>
        <main className="min-w-0">
          {canvas}
          {below}
        </main>
        <aside aria-label={inspectorTitle} className="hidden md:col-span-2 md:block lg:col-span-1">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-xs lg:sticky lg:top-22">{inspector}</div>
        </aside>
      </div>

      {/* Mobile: sticky action bar + sheets */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div className="flex items-center gap-1">
          <MobileBarButton label={`Files (${count})`} onClick={() => setSheet("files")}>
            <Images />
          </MobileBarButton>
          <MobileBarButton label={inspectorTitle} onClick={() => setSheet("settings")}>
            <SlidersHorizontal />
          </MobileBarButton>
          <MobileBarButton label="Undo" onClick={undo} disabled={!canUndo}>
            <Undo2 />
          </MobileBarButton>
          <MobileBarButton label="Redo" onClick={redo} disabled={!canRedo}>
            <Redo2 />
          </MobileBarButton>
          {exportAction && (
            <Button variant="primary" size="lg" className="ml-auto h-11" onClick={exportAction.onClick} disabled={exportAction.disabled || exportAction.busy}>
              {exportAction.busy ? <Loader2 className="animate-spin" /> : <Download />}
              Export
            </Button>
          )}
        </div>
      </div>
      <BottomSheet open={sheet === "files"} onOpenChange={(v) => setSheet(v ? "files" : null)} title="Screenshots">
        <FileTray hint={fileHint} onAfterSelect={() => setSheet(null)} />
      </BottomSheet>
      <BottomSheet open={sheet === "settings"} onOpenChange={(v) => setSheet(v ? "settings" : null)} title={inspectorTitle}>
        {inspector}
      </BottomSheet>
    </div>
  );
}

function MobileBarButton({ label, children, onClick, disabled }: { label: string; children: ReactNode; onClick(): void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 disabled:opacity-35 [&_svg]:size-5">
      {children}
    </button>
  );
}
