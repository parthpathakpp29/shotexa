/**
 * Workspace store (Zustand, vanilla) — lightweight logical state only (architecture §21).
 * One store per WorkspaceRuntime, created by the WorkspaceProvider (no global singleton).
 */
import { createStore } from "zustand/vanilla";
import type { ToolId } from "@/config/tools";
import { clampRect } from "@/core/redaction/geometry";
import type { ImageRect, Redaction, RedactionMode, RedactionSession } from "@/core/redaction/types";
import type { EditorSession, ExportSettings, FileId, Job, OcrLanguageChoice, OcrSession, Operation, OverlapHint, PdfBreakEdit, PdfSession, SplitSession, EncodeSession, StitchPair, StitchSession, StitchViewMode, WorkspaceDocument, WorkspaceFile } from "./types";
import { DEFAULT_COMBINE_SETTINGS } from "@/core/combine/layout";
import type { CombineSettings } from "@/core/combine/types";
import { IDENTITY_TRANSFORM, sameTransform } from "@/core/image-transform/transform";
import type { ImageTransform } from "@/core/image-transform/types";
import { DEFAULT_STYLE } from "@/core/annotation/objects";
import type { AnnotationObject, AnnotationSession, AnnotationStyle, AnnotationTool } from "@/core/annotation/types";
import type { SplitSettings } from "@/core/split/types";
import type { EncodeSettings, EncodeTool } from "@/core/image-encode/types";
import { DEFAULT_ENCODE_SETTINGS, normaliseSettings } from "@/core/image-encode/settings";

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
  combine: CombineSettings;
  stitch: StitchSession;
  redaction: RedactionSession;
  ocr: OcrSession;
  pdf: PdfSession;
  editor: EditorSession;
  annotation: AnnotationSession;
  split: SplitSession;
  encode: EncodeSession;
  documents: Record<string, WorkspaceDocument>;
  documentOrder: string[];
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
  setCombineSettings(settings: Partial<CombineSettings>): void;
  setPair(pair: StitchPair): void;
  setPairOffset(key: string, offset: number, opts?: { record?: boolean; coalesce?: boolean; now?: number }): void;
  resetPairs(keys?: string[]): void;
  setViewMode(mode: StitchViewMode): void;
  setActiveJoin(i: number): void;
  setManualMode(on: boolean): void;
  setRedactionMode(mode: RedactionMode): void;
  setRedactionIntensity(kind: "blur" | "pixelate", value: number): void;
  selectRedaction(id: string | null): void;
  addRedaction(assetId: FileId, rect: ImageRect, mode?: RedactionMode): string;
  updateRedaction(assetId: FileId, id: string, patch: Partial<Pick<Redaction, "rect" | "mode" | "intensity">>, opts?: { coalesce?: boolean; now?: number }): void;
  deleteRedaction(assetId: FileId, id: string): void;
  clearRedactions(assetId: FileId): void;
  setOcrLanguage(language: OcrLanguageChoice): void;
  beginOcr(assetId: FileId, language?: OcrLanguageChoice): void;
  setOcrProgress(assetId: FileId, progress: number, stage: string): void;
  completeOcr(assetId: FileId, result: { resultId: string; editedText: string; confidence?: number; durationMs: number }): void;
  failOcr(assetId: FileId, error: string): void;
  cancelOcr(assetId: FileId): void;
  setOcrEditedText(assetId: FileId, text: string): void;
  setPdfInputs(ids: FileId[]): void;
  setPdfSettings(settings: Partial<Pick<PdfSession, "paper" | "marginPt" | "smart" | "imageFormat" | "jpegQuality">>): void;
  setPdfStatus(status: PdfSession["status"], progress?: number | null, stage?: string, error?: string): void;
  setPdfPlan(plan: PdfSession["plan"]): void;
  selectPdfBreak(selected: PdfSession["selectedBreak"]): void;
  setPdfBreakEdit(assetId: FileId, edit: PdfBreakEdit, opts?: { record?: boolean; coalesce?: boolean; now?: number }): void;
  resetPdfBreaks(assetId: FileId): void;
  addDocument(document: WorkspaceDocument): void;
  removeDocument(id: string): void;
  addArtifact(file: WorkspaceFile): void;
  /**
   * Add several artifacts at once (e.g. Split pieces). The first becomes the selected file, so
   * a batch never leaves the user looking at its last item.
   */
  addArtifacts(files: WorkspaceFile[]): void;
  /**
   * Replace an asset's editor transform as one undoable step. `coalesce` merges rapid edits
   * of the same asset (typed dimensions, arrow-key nudges) into a single undo step.
   */
  setEditTransform(assetId: FileId, next: ImageTransform, opts?: { coalesce?: boolean; now?: number }): void;
  /** Back to the original image — undoable like any other edit. */
  resetEditTransform(assetId: FileId): void;
  setAnnotationTool(tool: AnnotationTool): void;
  selectAnnotation(id: string | null): void;
  setAnnotationStyle(style: Partial<AnnotationStyle>): void;
  /**
   * Replace an asset's annotations as one undoable step. `coalesce` is a gesture key (e.g.
   * `text:<id>`): consecutive rapid edits with the SAME key merge into one step, so typing or
   * nudging never folds an unrelated action (like adding an arrow) into the same undo.
   * `select` sets the selection in the same update.
   */
  setAnnotations(assetId: FileId, next: AnnotationObject[], opts?: { coalesce?: string; now?: number; select?: string | null }): void;
  /**
   * Replace an asset's split settings as one undoable step (`null` = back to the default split).
   * `coalesce` is a gesture key, as for annotations (typing a count, nudging one line).
   */
  setSplit(assetId: FileId, next: SplitSettings | null, opts?: { coalesce?: string; now?: number }): void;
  setEncodeSettings(tool: EncodeTool, patch: Partial<EncodeSettings>): void;
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
  combine: DEFAULT_COMBINE_SETTINGS,
  stitch: { pairs: {}, viewMode: "normal", activeJoin: 0, manualMode: false },
  redaction: { byAsset: {}, selectedId: null, mode: "blackout", blurIntensity: 18, pixelateIntensity: 16 },
  ocr: { language: "eng", byAsset: {} },
  pdf: {
    paper: "a4",
    marginPt: 28,
    smart: true,
    imageFormat: "jpeg",
    jpegQuality: 0.9,
    inputIds: [],
    status: "idle",
    progress: null,
    plan: null,
    selectedBreak: null,
    edits: {},
    lastDocumentId: null,
  },
  editor: { byAsset: {} },
  annotation: { byAsset: {}, selectedId: null, tool: "arrow", style: DEFAULT_STYLE },
  split: { byAsset: {} },
  encode: DEFAULT_ENCODE_SETTINGS,
  documents: {},
  documentOrder: [],
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
      } else if (op.type === "STITCH_SET_OFFSET") {
        const value = dir === 1 ? op.to : op.from;
        set((s) => {
          const p = s.stitch.pairs[op.pair];
          return p ? { stitch: { ...s.stitch, pairs: { ...s.stitch.pairs, [op.pair]: { ...p, offset: value } } } } : {};
        });
      } else if (op.type === "ADD_REDACTION" || op.type === "DELETE_REDACTION") {
        const add = (op.type === "ADD_REDACTION") === (dir === 1);
        const r = op.redaction;
        set((s) => {
          const list = s.redaction.byAsset[r.assetId] ?? [];
          const next = add ? [...list.filter((x) => x.id !== r.id), r] : list.filter((x) => x.id !== r.id);
          return { redaction: { ...s.redaction, byAsset: { ...s.redaction.byAsset, [r.assetId]: next }, selectedId: add ? r.id : s.redaction.selectedId === r.id ? null : s.redaction.selectedId } };
        });
      } else if (op.type === "UPDATE_REDACTION") {
        const value = dir === 1 ? op.after : op.before;
        set((s) => ({ redaction: { ...s.redaction, byAsset: { ...s.redaction.byAsset, [value.assetId]: (s.redaction.byAsset[value.assetId] ?? []).map((r) => (r.id === value.id ? value : r)) } } }));
      } else if (op.type === "CLEAR_REDACTIONS") {
        set((s) => ({ redaction: { ...s.redaction, byAsset: { ...s.redaction.byAsset, [op.assetId]: dir === 1 ? [] : op.redactions }, selectedId: null } }));
      } else if (op.type === "COMBINE_SET_SETTINGS") {
        set({ combine: dir === 1 ? op.after : op.before });
      } else if (op.type === "EDIT_SET_TRANSFORM") {
        const value = dir === 1 ? op.after : op.before;
        set((s) => ({ editor: { ...s.editor, byAsset: { ...s.editor.byAsset, [op.assetId]: value } } }));
      } else if (op.type === "ANNOTATE_SET") {
        const value = dir === 1 ? op.after : op.before;
        set((s) => ({
          annotation: {
            ...s.annotation,
            byAsset: { ...s.annotation.byAsset, [op.assetId]: value },
            // Never leave a selection pointing at an object that undo/redo just removed.
            selectedId: value.some((o) => o.id === s.annotation.selectedId) ? s.annotation.selectedId : null,
          },
        }));
      } else if (op.type === "SPLIT_SET") {
        const value = dir === 1 ? op.after : op.before;
        set((s) => {
          const byAsset = { ...s.split.byAsset };
          if (value) byAsset[op.assetId] = value;
          else delete byAsset[op.assetId];
          return { split: { byAsset } };
        });
      } else if (op.type === "PDF_SET_BREAKS") {
        // Every operation is matched explicitly: a new type must never fall into another's branch.
        const value = dir === 1 ? op.after : op.before;
        set((s) => ({ pdf: { ...s.pdf, edits: { ...s.pdf.edits, [op.assetId]: value }, selectedBreak: null } }));
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
          const byAsset = { ...s.redaction.byAsset };
          delete byAsset[id];
          const ocrByAsset = { ...s.ocr.byAsset };
          delete ocrByAsset[id];
          const pdfEdits = { ...s.pdf.edits };
          delete pdfEdits[id];
          const editorByAsset = { ...s.editor.byAsset };
          delete editorByAsset[id];
          const annotationByAsset = { ...s.annotation.byAsset };
          delete annotationByAsset[id];
          const splitByAsset = { ...s.split.byAsset };
          delete splitByAsset[id];
          return {
            files,
            order,
            selectedId: s.selectedId === id ? (order[0] ?? null) : s.selectedId,
            lastArtifactId: s.lastArtifactId === id ? null : s.lastArtifactId,
            // Undo entries may reference removed files/pairs: drop history rather than replay invalid steps.
            history: { past: [], future: [] },
            stitch: { ...s.stitch, pairs, activeJoin: 0 },
            redaction: { ...s.redaction, byAsset, selectedId: null },
            ocr: { ...s.ocr, byAsset: ocrByAsset },
            pdf: { ...s.pdf, inputIds: s.pdf.inputIds.filter((x) => x !== id), edits: pdfEdits, plan: null, selectedBreak: null },
            editor: { ...s.editor, byAsset: editorByAsset },
            annotation: { ...s.annotation, byAsset: annotationByAsset, selectedId: null },
            split: { byAsset: splitByAsset },
            overlapHint: { ...s.overlapHint, status: "idle", pairs: s.overlapHint.pairs.filter((k) => !k.includes(id)) },
          };
        });
        onRemove?.(id);
      },
      clear() {
        const ids = [...get().order, ...get().documentOrder];
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
      setCombineSettings(settings) {
        const before = get().combine;
        const after = { ...before, ...settings };
        if (JSON.stringify(before) === JSON.stringify(after)) return;
        applyOp({ type: "COMBINE_SET_SETTINGS", before, after }, 1);
        record({ type: "COMBINE_SET_SETTINGS", before, after });
      },
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
      setRedactionMode: (mode) => set((s) => ({ redaction: { ...s.redaction, mode } })),
      setRedactionIntensity(kind, value) {
        const key = kind === "blur" ? "blurIntensity" : "pixelateIntensity";
        set((s) => ({ redaction: { ...s.redaction, [key]: Math.max(2, Math.round(value)) } }));
      },
      selectRedaction: (id) => set((s) => ({ redaction: { ...s.redaction, selectedId: id } })),
      addRedaction(assetId, rect, mode) {
        const s = get();
        const file = s.files[assetId];
        if (!file) return "";
        const selectedMode = mode ?? s.redaction.mode;
        const redaction: Redaction = {
          id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          assetId,
          mode: selectedMode,
          rect: clampRect(rect, file.width, file.height, 2),
          intensity: selectedMode === "blur" ? s.redaction.blurIntensity : selectedMode === "pixelate" ? s.redaction.pixelateIntensity : 1,
        };
        applyOp({ type: "ADD_REDACTION", redaction }, 1);
        record({ type: "ADD_REDACTION", redaction });
        return redaction.id;
      },
      updateRedaction(assetId, id, patch, opts = {}) {
        const s = get();
        const file = s.files[assetId];
        const before = s.redaction.byAsset[assetId]?.find((r) => r.id === id);
        if (!file || !before) return;
        const after: Redaction = {
          ...before,
          ...patch,
          rect: clampRect(patch.rect ?? before.rect, file.width, file.height, 2),
          intensity: Math.max(1, patch.intensity ?? before.intensity),
        };
        if (JSON.stringify(before) === JSON.stringify(after)) return;
        const now = opts.now ?? Date.now();
        const last = s.history.past.at(-1);
        if (opts.coalesce && last?.type === "UPDATE_REDACTION" && last.after.id === id && now - last.at < COALESCE_MS) {
          set((state) => ({ history: { past: [...state.history.past.slice(0, -1), { ...last, after, at: now }], future: [] } }));
        } else record({ type: "UPDATE_REDACTION", before, after, at: now });
        applyOp({ type: "UPDATE_REDACTION", before, after, at: now }, 1);
      },
      deleteRedaction(assetId, id) {
        const redaction = get().redaction.byAsset[assetId]?.find((r) => r.id === id);
        if (!redaction) return;
        applyOp({ type: "DELETE_REDACTION", redaction }, 1);
        record({ type: "DELETE_REDACTION", redaction });
      },
      clearRedactions(assetId) {
        const redactions = get().redaction.byAsset[assetId] ?? [];
        if (!redactions.length) return;
        applyOp({ type: "CLEAR_REDACTIONS", assetId, redactions }, 1);
        record({ type: "CLEAR_REDACTIONS", assetId, redactions });
      },
      setOcrLanguage: (language) => set((s) => ({ ocr: { ...s.ocr, language } })),
      beginOcr(assetId, language) {
        set((s) => ({
          ocr: {
            ...s.ocr,
            language: language ?? s.ocr.language,
            byAsset: {
              ...s.ocr.byAsset,
              [assetId]: {
                status: "running",
                language: language ?? s.ocr.language,
                resultId: s.ocr.byAsset[assetId]?.resultId ?? null,
                editedText: s.ocr.byAsset[assetId]?.editedText ?? "",
                progress: 0,
                stage: "Preparing screenshot",
              },
            },
          },
        }));
      },
      setOcrProgress(assetId, progress, stage) {
        set((s) => {
          const current = s.ocr.byAsset[assetId];
          if (!current || current.status !== "running") return {};
          return { ocr: { ...s.ocr, byAsset: { ...s.ocr.byAsset, [assetId]: { ...current, progress: Math.max(0, Math.min(1, progress)), stage } } } };
        });
      },
      completeOcr(assetId, result) {
        set((s) => {
          const current = s.ocr.byAsset[assetId];
          if (!current) return {};
          return { ocr: { ...s.ocr, byAsset: { ...s.ocr.byAsset, [assetId]: { ...current, ...result, status: "done", progress: 1, stage: "Text ready", error: undefined } } } };
        });
      },
      failOcr(assetId, error) {
        set((s) => {
          const current = s.ocr.byAsset[assetId];
          if (!current) return {};
          return { ocr: { ...s.ocr, byAsset: { ...s.ocr.byAsset, [assetId]: { ...current, status: "failed", progress: null, stage: undefined, error } } } };
        });
      },
      cancelOcr(assetId) {
        set((s) => {
          const current = s.ocr.byAsset[assetId];
          if (!current) return {};
          return { ocr: { ...s.ocr, byAsset: { ...s.ocr.byAsset, [assetId]: { ...current, status: "cancelled", progress: null, stage: undefined, error: "OCR_CANCELLED" } } } };
        });
      },
      setOcrEditedText(assetId, text) {
        set((s) => {
          const current = s.ocr.byAsset[assetId];
          return current ? { ocr: { ...s.ocr, byAsset: { ...s.ocr.byAsset, [assetId]: { ...current, editedText: text } } } } : {};
        });
      },
      setPdfInputs(ids) {
        set((s) => ({ pdf: { ...s.pdf, inputIds: [...ids], plan: null, selectedBreak: null, status: "idle", error: undefined } }));
      },
      setPdfSettings(settings) {
        set((s) => ({ pdf: { ...s.pdf, ...settings, plan: null, selectedBreak: null, error: undefined } }));
      },
      setPdfStatus(status, progress = null, stage, error) {
        set((s) => ({ pdf: { ...s.pdf, status, progress, stage, error } }));
      },
      setPdfPlan(plan) {
        set((s) => ({ pdf: { ...s.pdf, plan, status: plan ? "ready" : s.pdf.status, progress: plan ? 1 : s.pdf.progress, stage: plan ? "Preview ready" : s.pdf.stage, error: undefined } }));
      },
      selectPdfBreak: (selectedBreak) => set((s) => ({ pdf: { ...s.pdf, selectedBreak } })),
      setPdfBreakEdit(assetId, edit, opts = {}) {
        const before = get().pdf.edits[assetId] ?? { manual: [] };
        if (JSON.stringify(before) === JSON.stringify(edit)) return;
        const now = opts.now ?? Date.now();
        if (opts.record !== false) {
          const last = get().history.past.at(-1);
          if (opts.coalesce && last?.type === "PDF_SET_BREAKS" && last.assetId === assetId && now - last.at < COALESCE_MS) {
            set((s) => ({ history: { past: [...s.history.past.slice(0, -1), { ...last, after: edit, at: now }], future: [] } }));
          } else record({ type: "PDF_SET_BREAKS", assetId, before, after: edit, at: now });
        }
        applyOp({ type: "PDF_SET_BREAKS", assetId, before, after: edit, at: now }, 1);
      },
      resetPdfBreaks(assetId) {
        get().setPdfBreakEdit(assetId, { manual: [] });
      },
      addDocument(document) {
        set((s) => ({
          documents: { ...s.documents, [document.id]: document },
          documentOrder: [...s.documentOrder.filter((id) => id !== document.id), document.id],
          pdf: { ...s.pdf, lastDocumentId: document.id },
        }));
      },
      removeDocument(id) {
        if (!get().documents[id]) return;
        set((s) => {
          const documents = { ...s.documents };
          delete documents[id];
          return {
            documents,
            documentOrder: s.documentOrder.filter((x) => x !== id),
            pdf: { ...s.pdf, lastDocumentId: s.pdf.lastDocumentId === id ? null : s.pdf.lastDocumentId },
          };
        });
        onRemove?.(id);
      },
      addArtifact(file) {
        set((s) => ({ files: { ...s.files, [file.id]: file }, order: [...s.order, file.id], selectedId: file.id, lastArtifactId: file.id }));
      },
      addArtifacts(list) {
        if (!list.length) return;
        set((s) => ({
          files: { ...s.files, ...Object.fromEntries(list.map((f) => [f.id, f])) },
          order: [...s.order, ...list.map((f) => f.id)],
          selectedId: list[0].id,
          lastArtifactId: list[0].id,
        }));
      },
      setEditTransform(assetId, next, opts = {}) {
        if (!get().files[assetId]) return;
        const before = get().editor.byAsset[assetId] ?? IDENTITY_TRANSFORM;
        if (sameTransform(before, next)) return;
        const now = opts.now ?? Date.now();
        const last = get().history.past.at(-1);
        if (opts.coalesce && last?.type === "EDIT_SET_TRANSFORM" && last.assetId === assetId && now - last.at < COALESCE_MS) {
          set((s) => ({ history: { past: [...s.history.past.slice(0, -1), { ...last, after: next, at: now }], future: [] } }));
        } else record({ type: "EDIT_SET_TRANSFORM", assetId, before, after: next, at: now });
        applyOp({ type: "EDIT_SET_TRANSFORM", assetId, before, after: next, at: now }, 1);
      },
      resetEditTransform(assetId) {
        get().setEditTransform(assetId, IDENTITY_TRANSFORM);
      },
      setAnnotationTool: (tool) => set((s) => ({ annotation: { ...s.annotation, tool } })),
      selectAnnotation: (id) => set((s) => ({ annotation: { ...s.annotation, selectedId: id } })),
      setAnnotationStyle: (style) => set((s) => ({ annotation: { ...s.annotation, style: { ...s.annotation.style, ...style } } })),
      setAnnotations(assetId, next, opts = {}) {
        if (!get().files[assetId]) return;
        const before = get().annotation.byAsset[assetId] ?? [];
        if (JSON.stringify(before) !== JSON.stringify(next)) {
          const now = opts.now ?? Date.now();
          const last = get().history.past.at(-1);
          const merge = !!opts.coalesce && last?.type === "ANNOTATE_SET" && last.assetId === assetId && last.key === opts.coalesce && now - last.at < COALESCE_MS;
          if (merge) {
            set((s) => ({ history: { past: [...s.history.past.slice(0, -1), { ...last, after: next, at: now }], future: [] } }));
          } else record({ type: "ANNOTATE_SET", assetId, before, after: next, at: now, key: opts.coalesce });
          applyOp({ type: "ANNOTATE_SET", assetId, before, after: next, at: now }, 1);
        }
        if (opts.select !== undefined) set((s) => ({ annotation: { ...s.annotation, selectedId: opts.select ?? null } }));
      },
      setEncodeSettings: (tool, patch) => set((s) => ({ encode: { ...s.encode, [tool]: normaliseSettings({ ...s.encode[tool], ...patch }) } })),
      setSplit(assetId, next, opts = {}) {
        if (!get().files[assetId]) return;
        const before = get().split.byAsset[assetId] ?? null;
        if (JSON.stringify(before) !== JSON.stringify(next)) {
          const now = opts.now ?? Date.now();
          const last = get().history.past.at(-1);
          const merge = !!opts.coalesce && last?.type === "SPLIT_SET" && last.assetId === assetId && last.key === opts.coalesce && now - last.at < COALESCE_MS;
          if (merge) {
            set((s) => ({ history: { past: [...s.history.past.slice(0, -1), { ...last, after: next, at: now }], future: [] } }));
          } else record({ type: "SPLIT_SET", assetId, before, after: next, at: now, key: opts.coalesce });
          applyOp({ type: "SPLIT_SET", assetId, before, after: next, at: now }, 1);
        }
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
