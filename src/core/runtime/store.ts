/**
 * Workspace store (Zustand, vanilla) — lightweight logical state only (architecture §21).
 * One store per WorkspaceRuntime, created by the WorkspaceProvider (no global singleton).
 */
import { createStore } from "zustand/vanilla";
import type { ToolId } from "@/config/tools";
import type { ExportSettings, FileId, Job, Operation, OverlapHint, StitchPair, StitchSession, StitchViewMode, WorkspaceFile } from "./types";

/** Consecutive offset edits on the same join within this window merge into one undo step (slider drags). */
export const COALESCE_MS = 600;
export const HISTORY_LIMIT = 50;

export const pairKey = (a: FileId, b: FileId) => `${a}|${b}`;

export interface WorkspaceState {
  files: Record<FileId, WorkspaceFile>;
  order: FileId[];
  selectedId: FileId | null;
  activeTool: ToolId | null;
  history: { past: Operation[]; future: Operation[] };
  jobs: Record<string, Job>;
  exportSettings: ExportSettings;
  overlapHint: OverlapHint;
  stitch: StitchSession;
  /** Most recent tool output (e.g. the stitched image) for "Continue with…". */
  lastArtifactId: FileId | null;
}

export interface WorkspaceActions {
  addFiles(files: WorkspaceFile[]): void;
  removeFile(id: FileId): void;
  clear(): void;
  select(id: FileId | null): void;
  setActiveTool(tool: ToolId | null): void;
  markPreview(id: FileId): void;
  reorder(from: number, to: number): void;
  undo(): void;
  redo(): void;
  upsertJob(job: Job): void;
  setExportSettings(s: Partial<ExportSettings>): void;
  setOverlapHint(h: Partial<OverlapHint>): void;
  setPair(pair: StitchPair): void;
  setPairOffset(key: string, offset: number, opts?: { record?: boolean; coalesce?: boolean; now?: number }): void;
  resetPairs(keys?: string[]): void;
  setViewMode(mode: StitchViewMode): void;
  setActiveJoin(i: number): void;
  setManualMode(on: boolean): void;
  addArtifact(file: WorkspaceFile): void;
}

export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

const initial = (): WorkspaceState => ({
  files: {},
  order: [],
  selectedId: null,
  activeTool: null,
  history: { past: [], future: [] },
  jobs: {},
  exportSettings: { format: "png", quality: 0.92 },
  overlapHint: { status: "idle", pairs: [], dismissed: false },
  stitch: { pairs: {}, viewMode: "normal", activeJoin: 0, manualMode: false },
  lastArtifactId: null,
});

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function createWorkspaceStore(onRemove?: (id: FileId) => void) {
  return createStore<WorkspaceState & WorkspaceActions>()((set, get) => {
    const record = (op: Operation) =>
      set((s) => ({ history: { past: [...s.history.past, op].slice(-HISTORY_LIMIT), future: [] } }));

    /** Apply an operation's effect (forward) without touching history. */
    const applyOp = (op: Operation, dir: 1 | -1) => {
      if (op.type === "REORDER") {
        const [from, to] = dir === 1 ? [op.from, op.to] : [op.to, op.from];
        set((s) => (from < s.order.length && to < s.order.length ? { order: move(s.order, from, to) } : {}));
      } else {
        const value = dir === 1 ? op.to : op.from;
        set((s) => {
          const p = s.stitch.pairs[op.pair];
          return p ? { stitch: { ...s.stitch, pairs: { ...s.stitch.pairs, [op.pair]: { ...p, offset: value } } } } : {};
        });
      }
    };

    return {
      ...initial(),
      addFiles(files) {
        set((s) => {
          const next = { ...s.files };
          for (const f of files) next[f.id] = f;
          return {
            files: next,
            order: [...s.order, ...files.map((f) => f.id)],
            selectedId: s.selectedId ?? files[0]?.id ?? null,
            overlapHint: files.length ? { ...s.overlapHint, status: "idle", dismissed: false } : s.overlapHint,
          };
        });
      },
      removeFile(id) {
        if (!get().files[id]) return;
        set((s) => {
          const files = { ...s.files };
          delete files[id];
          const order = s.order.filter((x) => x !== id);
          const pairs = Object.fromEntries(Object.entries(s.stitch.pairs).filter(([, p]) => p.a !== id && p.b !== id));
          return {
            files,
            order,
            selectedId: s.selectedId === id ? (order[0] ?? null) : s.selectedId,
            lastArtifactId: s.lastArtifactId === id ? null : s.lastArtifactId,
            // Undo entries may reference removed files/pairs: drop history rather than replay invalid steps.
            history: { past: [], future: [] },
            stitch: { ...s.stitch, pairs, activeJoin: 0 },
            overlapHint: { ...s.overlapHint, status: "idle", pairs: s.overlapHint.pairs.filter((k) => !k.includes(id)) },
          };
        });
        onRemove?.(id);
      },
      clear() {
        const ids = get().order;
        set(initial());
        for (const id of ids) onRemove?.(id);
      },
      select: (id) => set({ selectedId: id }),
      setActiveTool: (tool) => set({ activeTool: tool }),
      markPreview(id) {
        set((s) => (s.files[id] ? { files: { ...s.files, [id]: { ...s.files[id], previewVersion: s.files[id].previewVersion + 1 } } } : {}));
      },
      reorder(from, to) {
        const n = get().order.length;
        if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
        applyOp({ type: "REORDER", from, to }, 1);
        record({ type: "REORDER", from, to });
        set((s) => ({ overlapHint: { ...s.overlapHint, status: "idle" }, stitch: { ...s.stitch, activeJoin: 0 } }));
      },
      undo() {
        const op = get().history.past.at(-1);
        if (!op) return;
        applyOp(op, -1);
        set((s) => ({ history: { past: s.history.past.slice(0, -1), future: [...s.history.future, op] } }));
      },
      redo() {
        const op = get().history.future.at(-1);
        if (!op) return;
        applyOp(op, 1);
        set((s) => ({ history: { past: [...s.history.past, op], future: s.history.future.slice(0, -1) } }));
      },
      upsertJob: (job) => set((s) => ({ jobs: { ...s.jobs, [job.id]: job } })),
      setExportSettings: (e) => set((s) => ({ exportSettings: { ...s.exportSettings, ...e } })),
      setOverlapHint: (h) => set((s) => ({ overlapHint: { ...s.overlapHint, ...h } })),
      setPair: (pair) => set((s) => ({ stitch: { ...s.stitch, pairs: { ...s.stitch.pairs, [pair.key]: pair } } })),
      setPairOffset(key, offset, opts = {}) {
        const p = get().stitch.pairs[key];
        if (!p || p.offset === offset) return;
        const now = opts.now ?? Date.now();
        if (opts.record !== false) {
          const last = get().history.past.at(-1);
          if (opts.coalesce && last?.type === "STITCH_SET_OFFSET" && last.pair === key && now - last.at < COALESCE_MS) {
            set((s) => ({ history: { past: [...s.history.past.slice(0, -1), { ...last, to: offset, at: now }], future: [] } }));
          } else record({ type: "STITCH_SET_OFFSET", pair: key, from: p.offset, to: offset, at: now });
        }
        applyOp({ type: "STITCH_SET_OFFSET", pair: key, from: p.offset, to: offset, at: now }, 1);
      },
      resetPairs(keys) {
        const s = get();
        for (const k of keys ?? Object.keys(s.stitch.pairs)) {
          const p = get().stitch.pairs[k];
          if (p && p.offset !== p.autoOffset) get().setPairOffset(k, p.autoOffset);
        }
      },
      setViewMode: (mode) => set((s) => ({ stitch: { ...s.stitch, viewMode: mode } })),
      setActiveJoin: (i) => set((s) => ({ stitch: { ...s.stitch, activeJoin: i } })),
      setManualMode: (on) => set((s) => ({ stitch: { ...s.stitch, manualMode: on } })),
      addArtifact(file) {
        set((s) => ({ files: { ...s.files, [file.id]: file }, order: [...s.order, file.id], selectedId: file.id, lastArtifactId: file.id }));
      },
    };
  });
}

/** Originals in workspace order (Smart Stitch inputs). */
export const selectOriginals = (s: WorkspaceState) => s.order.map((id) => s.files[id]).filter((f) => f && f.kind === "original");
/** Adjacent pair keys for the current original order. */
export const selectJoinKeys = (s: WorkspaceState) => {
  const o = selectOriginals(s);
  return o.slice(1).map((f, i) => pairKey(o[i].id, f.id));
};
