"use client";

/**
 * The Compare review step inside a workflow. It is the real Compare stage and the real
 * summary panel — the workflow never renders its own comparison or its own numbers.
 */
import { useCallback, useState } from "react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import type { CompareVisualAnalysis } from "@/core/compare/types";
import { CompareStage } from "./compare-stage";
import { CompareSummaryPanel } from "./compare-summary";

export function CompareWorkflowStage({ assetA, assetB }: { assetA: string; assetB: string }) {
  const fileA = useWorkspace((s) => s.files[assetA]);
  const fileB = useWorkspace((s) => s.files[assetB]);
  const [analysis, setAnalysis] = useState<CompareVisualAnalysis | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
  const [selectedTextChange, setSelectedTextChange] = useState<string | null>(null);
  const [drawIgnore, setDrawIgnore] = useState(false);
  const onAnalysis = useCallback((next: CompareVisualAnalysis | null) => setAnalysis(next), []);
  if (!fileA || !fileB) return null;
  return (
    <>
      <CompareStage
        key={`${assetA}|${assetB}`}
        assetA={assetA}
        assetB={assetB}
        selectedRegion={selectedRegion}
        onSelectRegion={setSelectedRegion}
        selectedTextChange={selectedTextChange}
        onSelectTextChange={setSelectedTextChange}
        drawIgnore={drawIgnore}
        onDrawIgnore={setDrawIgnore}
        onAnalysis={onAnalysis}
      />
      <CompareSummaryPanel
        fileA={fileA}
        fileB={fileB}
        analysis={analysis}
        selectedRegion={selectedRegion}
        onSelectRegion={setSelectedRegion}
        selectedTextChange={selectedTextChange}
        onSelectTextChange={setSelectedTextChange}
        showReport={false}
      />
    </>
  );
}
