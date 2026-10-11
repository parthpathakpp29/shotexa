"use client";

/**
 * Reading Compare Pro's measured results. They live in the CompareAnalysisRegistry (outside
 * Zustand, because a region list or a text diff is far too big for undoable state), so the
 * views subscribe to a small version counter in the store and re-read the registry when it
 * moves. Nothing here measures anything itself.
 */
import { useMemo } from "react";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { compareAlignKey, comparePairKey } from "@/core/runtime/compare-analysis-registry";
import type { CompareAlignEstimate, CompareSettings, CompareTextDiff, CompareVisualAnalysis } from "@/core/compare/types";
import type { WorkspaceFile } from "@/core/runtime/types";

export interface CompareResults {
  pair: string;
  alignment: CompareAlignEstimate | null;
  textDiff: CompareTextDiff | null;
  visual: CompareVisualAnalysis | null;
  report: { kind: "pdf" | "zip" | "json"; name: string; blob: Blob; createdAt: number } | null;
}

/** Everything measured for the currently chosen pair. */
export function useCompareResults(fileA?: WorkspaceFile, fileB?: WorkspaceFile): CompareResults {
  const { runtime } = useWorkspaceContext();
  const settings = useWorkspace((s) => s.compare);
  const version = useWorkspace((s) => s.compareRun.version);
  const pair = comparePairKey(settings.a, settings.b);
  return useMemo(() => {
    void version;
    const key =
      fileA && fileB
        ? compareAlignKey(settings, { width: fileA.width, height: fileA.height }, { width: fileB.width, height: fileB.height })
        : null;
    return {
      pair,
      alignment: key ? runtime.compareAnalyses.alignment(pair, key) : null,
      textDiff: runtime.compareAnalyses.textDiff(pair),
      visual: runtime.compareAnalyses.visual(pair),
      report: runtime.compareAnalyses.report(pair),
    };
  }, [runtime, pair, version, settings, fileA, fileB]);
}

/** A stable, readable description of the two screenshots' differences in shape. */
export function describeMismatch(fileA: WorkspaceFile, fileB: WorkspaceFile): string[] {
  const notes: string[] = [];
  if (fileA.width !== fileB.width) notes.push(`Width differs: ${fileA.width} px and ${fileB.width} px`);
  if (fileA.height !== fileB.height) notes.push(`Height differs: ${fileA.height} px and ${fileB.height} px`);
  const ratioA = fileA.width / Math.max(1, fileA.height);
  const ratioB = fileB.width / Math.max(1, fileB.height);
  if (Math.abs(ratioA - ratioB) > 0.01) notes.push(`Aspect ratio differs: ${ratioA.toFixed(2)}:1 and ${ratioB.toFixed(2)}:1`);
  if (fileA.type !== fileB.type) notes.push(`Format differs: ${fileA.type.replace("image/", "").toUpperCase()} and ${fileB.type.replace("image/", "").toUpperCase()}`);
  return notes;
}

/** Shared patch helper so every control records one undoable Compare step. */
export function useCompareSettings(): { settings: CompareSettings; apply: (patch: Partial<CompareSettings>, coalesce?: string) => void } {
  const settings = useWorkspace((s) => s.compare);
  const setCompare = useWorkspace((s) => s.setCompare);
  return useMemo(
    () => ({
      settings,
      apply: (patch: Partial<CompareSettings>, coalesce?: string) => setCompare({ ...settings, ...patch }, { coalesce }),
    }),
    [settings, setCompare],
  );
}
