"use client";

/**
 * WorkspaceProvider — owns the WorkspaceRuntime for every route in the (workspace) group, so
 * files survive client-side navigation between the homepage and tools (architecture §9, §22).
 * Screenshots are never persisted: a full reload starts empty.
 *
 * Also owns the shared input surface: page-level paste (no clipboard button, no permission
 * prompt), one hidden file picker (⌘/Ctrl+O), and window-level drop protection.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createWorkspaceRuntime, type WorkspaceRuntime } from "@/core/runtime/runtime";
import { messageFor } from "@/core/runtime/messages";
import type { WorkspaceActions, WorkspaceState } from "@/core/runtime/store";
import type { FileSource } from "@/core/runtime/types";

interface WorkspaceContextValue {
  runtime: WorkspaceRuntime;
  openPicker(): void;
  addFiles(files: File[], source: FileSource): Promise<void>;
  loadSample(): Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const SAMPLE_FILES = ["/samples/sample-chat-1.png", "/samples/sample-chat-2.png"];
const ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [runtime] = useState(() => createWorkspaceRuntime());
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingDispose = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dispose when the workspace unmounts (leaving the group); survives StrictMode's double mount.
  useEffect(() => {
    if (pendingDispose.current) clearTimeout(pendingDispose.current);
    pendingDispose.current = null;
    return () => {
      pendingDispose.current = setTimeout(() => runtime.dispose(), 0);
    };
  }, [runtime]);

  const notify = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n.slice(-2), { id, text }]);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 6000);
  }, []);

  const addFiles = useCallback(
    async (files: File[], source: FileSource) => {
      if (!files.length) return;
      const r = await runtime.ingest(files, source);
      for (const x of r.rejected) notify(`${x.name} ${messageFor(x.code)}`);
    },
    [runtime, notify],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const loadSample = useCallback(async () => {
    const files = await Promise.all(
      SAMPLE_FILES.map(async (u) => {
        const b = await (await fetch(u)).blob();
        return new File([b], u.split("/").pop()!, { type: b.type || "image/png" });
      }),
    );
    await addFiles(files, "sample");
  }, [addFiles]);

  // Page-level paste: Ctrl/⌘+V anywhere (architecture §14 — listen for normal paste events).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files, "paste");
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openPicker();
      }
    };
    // Dropping a file outside a drop zone must never navigate away from the workspace.
    const guard = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, [addFiles, openPicker]);

  return (
    <WorkspaceContext.Provider value={{ runtime, openPicker, addFiles, loadSample }}>
      {children}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="file-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void addFiles(files, "picker");
        }}
      />
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 max-md:bottom-24">
        {notices.map((n) => (
          <p key={n.id} role="status" className="pointer-events-auto max-w-md rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink shadow-md">
            {n.text}
          </p>
        ))}
      </div>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceContext must be used inside WorkspaceProvider");
  return ctx;
}

/** Subscribe to a slice of the workspace store. */
export function useWorkspace<T>(selector: (s: WorkspaceState & WorkspaceActions) => T): T {
  return useStore(useWorkspaceContext().runtime.store, selector);
}

/** Drag-and-drop target props (validation happens in the runtime ingest). */
export function useDropTarget() {
  const { addFiles } = useWorkspaceContext();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return {
    over,
    props: {
      onDragEnter: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        depth.current++;
        setOver(true);
      },
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        void addFiles(Array.from(e.dataTransfer.files), "drop");
      },
    },
  };
}
