"use client";

import { ArrowLeft, ArrowRight, Download, ListChecks, Loader2, Play, RotateCcw, Settings2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge, FieldLabel, Notice, Progress } from "@/components/ui/primitives";
import { BitmapCanvas } from "@/components/workspace/bitmap-canvas";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { guideFor } from "@/config/workflow-guides";
import { annotationFrame } from "@/core/annotation/geometry";
import { DEFAULT_BEAUTIFY, STYLE_PRESETS } from "@/core/beautify/presets";
import type { BeautifySettings } from "@/core/beautify/types";
import { IDENTITY_TRANSFORM } from "@/core/image-transform/transform";
import { applyComparePreset, DEFAULT_COMPARE } from "@/core/compare/presets";
import { parseCustomRules, PRIVACY_RULES_STORAGE_KEY, saveCustomRules } from "@/core/privacy/custom-rules";
import { privacyConfigForPreset } from "@/core/privacy/presets";
import type { PrivacyFinding, PrivacyScanConfig } from "@/core/privacy/types";
import { messageFor } from "@/core/runtime/messages";
import { lazyWorkflowAdapters } from "@/core/workflows/lazy-adapters";
import { WorkflowEngine, type WorkflowEngineSnapshot } from "@/core/workflows/engine";
import { PRODUCT_QUICK_PRESETS, WEB_READY_PRESETS } from "@/core/workflows/recipes";
import { workflowOutputsFor } from "@/core/workflows/output-registry";
import type { WorkflowAction, WorkflowRecipe, WorkflowStepDefinition } from "@/core/workflows/types";
import { cn } from "@/lib/cn";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { StepConfig } from "./step-config";
import { WorkflowInputs } from "./workflow-inputs";
import { WorkflowIntro, WorkflowPlan, runningCopy } from "./workflow-overview";
import { CurrentStep, WorkflowCompletion, WorkflowStepper } from "./workflow-run";
import { cloneRecipe, downloadOutputs, iconFor } from "./workflow-shared";

/**
 * Every tool's review UI is loaded only once a workflow actually reaches its step. These are
 * full workspace renderers (canvas editors, the Beautifier stage, the privacy review): keeping
 * them out of this route's chunk keeps them out of anything that merely links to /workflows,
 * which Next prefetches — including the homepage.
 */
const loading = () => <StepLoading />;
const AnnotateCanvas = dynamic(() => import("@/components/tools/annotate/annotate-canvas").then((module) => module.AnnotateCanvas), { ssr: false, loading });
const AnnotateInspector = dynamic(() => import("@/components/tools/annotate/annotate-inspector").then((module) => module.AnnotateInspector), { ssr: false, loading });
const BeautifyStage = dynamic(() => import("@/components/tools/beautify/beautify-stage").then((module) => module.BeautifyStage), { ssr: false, loading });
const BeautifyInspector = dynamic(() => import("@/components/tools/beautify/beautify-inspector").then((module) => module.BeautifyInspector), { ssr: false, loading });
const RedactionCanvas = dynamic(() => import("@/components/tools/redaction/redaction-canvas").then((module) => module.RedactionCanvas), { ssr: false, loading });
const RedactionInspector = dynamic(() => import("@/components/tools/redaction/redaction-inspector").then((module) => module.RedactionInspector), { ssr: false, loading });
const PrivacyReview = dynamic(() => import("@/components/tools/redaction/privacy-review").then((module) => module.PrivacyReview), { ssr: false, loading });
const CompareWorkflowStage = dynamic(() => import("@/components/tools/compare/compare-workflow-stage").then((module) => module.CompareWorkflowStage), { ssr: false, loading });
const CompareInspector = dynamic(() => import("@/components/tools/compare/compare-inspector").then((module) => module.CompareInspector), { ssr: false, loading });

/** Shared placeholder while a step's editor arrives — same footprint, no layout jump. */
export function StepLoading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-40 items-center justify-center gap-2.5 rounded-lg border border-line bg-surface-3 p-6 text-sm text-ink-2">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      Loading this step…
    </div>
  );
}

function mergeBeautify(base: BeautifySettings, patch: Partial<BeautifySettings>): BeautifySettings {
  return { ...base, ...patch, background: { ...base.background, ...patch.background }, shadowAdvanced: { ...base.shadowAdvanced, ...patch.shadowAdvanced }, border: { ...base.border, ...patch.border }, text: { ...base.text, ...patch.text }, browser: { ...base.browser, ...patch.browser }, phone: { ...base.phone, ...patch.phone }, perspective: { ...base.perspective, ...patch.perspective }, composition: { ...base.composition, ...patch.composition }, branding: { ...base.branding, ...patch.branding }, animation: { ...base.animation, ...patch.animation } };
}

type Chosen = { ids: string[]; known: string[] };

export function WorkflowRunner({ recipe: initialRecipe, onExit }: { recipe: WorkflowRecipe; onExit(): void }) {
  const { runtime } = useWorkspaceContext();
  const outputs = useMemo(() => workflowOutputsFor(runtime), [runtime]);
  const order = useWorkspace((state) => state.order);
  const selectedId = useWorkspace((state) => state.selectedId);
  const addRedaction = useWorkspace((state) => state.addRedaction);
  const files = useWorkspace((state) => state.files);
  const [recipe, setRecipe] = useState(() => cloneRecipe(initialRecipe));
  // The adapters (and every tool engine they touch) load on the first step that runs.
  const [engine] = useState(() => new WorkflowEngine(recipe, lazyWorkflowAdapters(async () => (await import("@/core/workflows/adapters")).createWorkflowAdapters(runtime, outputs))));
  const [snapshot, setSnapshot] = useState<WorkflowEngineSnapshot>(engine.snapshot);
  const [sheet, setSheet] = useState<"steps" | "settings" | null>(null);
  const desktopInspector = useDesktopInspector();
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("Bug report");
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [, setSettingsVersion] = useState(0);
  const [quickPreset, setQuickPreset] = useState(recipe.id === "product-screenshot" ? "saas-launch" : recipe.id === "web-ready" ? "balanced" : "");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [inputNotice, setInputNotice] = useState<string | null>(null);
  const scanStep = recipe.steps.find((step) => step.action === "privacy-scan");
  const [privacyConfig, setPrivacyConfigState] = useState<PrivacyScanConfig>(() => {
    const value = privacyConfigForPreset(scanStep?.action === "privacy-scan" ? scanStep.config.preset ?? "maximum" : "maximum");
    value.includeLowConfidence = scanStep?.action === "privacy-scan" ? scanStep.config.includeLowConfidence ?? true : true;
    value.detectBarcodes = scanStep?.action === "privacy-scan" ? scanStep.config.detectBarcodes ?? value.detectBarcodes : value.detectBarcodes;
    value.customRules = typeof window === "undefined" ? [] : parseCustomRules(window.localStorage.getItem(PRIVACY_RULES_STORAGE_KEY));
    return value;
  });
  const [privacyVersion, setPrivacyVersion] = useState(0);
  const [privacyScanning, setPrivacyScanning] = useState(false);
  const [privacyStage, setPrivacyStage] = useState<string>();
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(null);
  const [hideLow, setHideLow] = useState(false);
  const [privacyAppliedSubtypes, setPrivacyAppliedSubtypes] = useState<string[]>([]);
  const prepared = useRef<string | null>(null);
  const previousAnalyticsStatus = useRef(snapshot.state.status);
  useEffect(() => engine.subscribe(setSnapshot), [engine]);
  useEffect(() => { const session = engine.toSession(); if (session) outputs.saveSession(session); }, [engine, outputs, snapshot.state.status]);
  useEffect(() => {
    if (snapshot.state.status === "completed" && previousAnalyticsStatus.current !== "completed") trackAnalyticsEvent("workflow_completed");
    previousAnalyticsStatus.current = snapshot.state.status;
  }, [snapshot.state.status]);

  const status = snapshot.state.status;
  const idle = status === "idle";
  const current = recipe.steps[snapshot.state.currentIndex];
  const activeId = snapshot.context.assetIds[0] ?? selectedId ?? order[0] ?? null;
  const activeFile = activeId ? files[activeId] : undefined;
  const privacyResult = activeId ? runtime.privacyScans.forAsset(activeId) ?? null : null;
  void privacyVersion;
  const transform = activeId ? runtime.store.getState().editor.byAsset[activeId] ?? IDENTITY_TRANSFORM : IDENTITY_TRANSFORM;
  const frame = activeFile ? annotationFrame(transform, activeFile) : null;

  // Which screenshots the workflow uses. Before the run: the user's explicit choice, or — until
  // they make one — the selected screenshot followed by the rest, up to the recipe's maximum.
  // Screenshots pasted or dropped after a choice join it while there is room. Once running,
  // the run's own inputs are the truth.
  const max = recipe.input.max;
  const defaultInputs = useMemo(() => {
    const candidates = selectedId ? [selectedId, ...order.filter((id) => id !== selectedId)] : order;
    return candidates.slice(0, max ?? candidates.length);
  }, [order, selectedId, max]);
  const idleInputs = (() => {
    if (!chosen) return defaultInputs;
    const fresh = order.filter((id) => !chosen.known.includes(id) && !chosen.ids.includes(id) && files[id]?.kind === "original");
    if (max === 1 && fresh.length) return [fresh[fresh.length - 1]];
    return [...chosen.ids, ...fresh].slice(0, max ?? Infinity);
  })();
  const inputIds = (idle ? idleInputs : snapshot.context.originalAssetIds).filter((id) => !!files[id]);
  const inputsLocked = !idle && engine.inputChangeEffect(Math.max(recipe.input.min, inputIds.length)) === "busy";
  const changeRestarts = !idle && status !== "completed" && engine.inputChangeEffect(Math.max(recipe.input.min, inputIds.length)) === "restarted";
  const atInputReview = status === "waiting-review" && current?.action === "input";

  function setInputs(next: string[]) {
    setChosen({ ids: next, known: runtime.store.getState().order });
  }

  async function changeInputs(next: string[]) {
    const effect = engine.inputChangeEffect(next.length);
    if (effect === "busy") return;
    if (effect === "idle") { setInputs(next); return; }
    const needed = recipe.input.min;
    setInputNotice(
      effect === "restarted" ? (max === 1 ? "Shotexa restarted the workflow with the new screenshot. Steps that used the previous one were reset; your settings were kept." : "Shotexa restarted the workflow with the updated screenshots. Steps that used the previous ones were reset; your settings were kept.")
        : effect === "reset" ? `The workflow stopped because it needs ${needed === 1 ? "a screenshot" : `${needed} screenshots`}. Add ${needed === 1 ? "one" : "them"} to start again.`
          : null,
    );
    if (effect === "reset") setInputs(next);
    prepared.current = null;
    setSheet(null);
    await engine.replaceInputs(next);
  }

  useEffect(() => {
    if (!current || current.action !== "beautify" || !activeId || prepared.current === `${current.id}:${activeId}`) return;
    const preset = STYLE_PRESETS.find((item) => item.id === current.config.preset);
    const base = runtime.store.getState().beautify.byAsset[activeId] ?? DEFAULT_BEAUTIFY;
    const next = mergeBeautify(base, preset?.settings ?? {});
    next.preset = current.config.canvas ?? next.preset;
    next.composition = { ...next.composition, assetIds: snapshot.context.assetIds.slice(1, 3) };
    runtime.store.getState().setBeautify(activeId, next);
    runtime.store.getState().setExportSettings({ format: current.config.format ?? "webp", quality: current.config.quality ?? 0.86 });
    prepared.current = `${current.id}:${activeId}`;
  }, [activeId, current, runtime, snapshot.context.assetIds]);

  // The Compare review step must show the comparison the recipe asked for, not whatever the
  // Compare tool was last set to. The adapter applies the same settings when it runs.
  useEffect(() => {
    if (!current || current.action !== "compare") return;
    const [first, second] = snapshot.context.assetIds;
    if (!first || !second) return;
    const key = `${current.id}:${first}:${second}`;
    if (prepared.current === key) return;
    const base = { ...DEFAULT_COMPARE, ...runtime.store.getState().compare, a: first, b: second };
    const configured = current.config.preset ? applyComparePreset(base, current.config.preset) : base;
    runtime.store.getState().setCompare(
      {
        ...configured,
        mode: current.config.mode ?? configured.mode,
        alignment: { ...configured.alignment, mode: current.config.alignment ?? configured.alignment.mode },
      },
      { record: false },
    );
    prepared.current = key;
  }, [current, runtime, snapshot.context.assetIds]);

  async function start() {
    setInputNotice(null);
    await engine.start(inputIds);
  }
  function commitRecipe(next: WorkflowRecipe) {
    engine.configure(next);
    setRecipe(next);
  }
  function toggleStep(stepId: string, enabled: boolean) {
    commitRecipe({ ...recipe, steps: recipe.steps.map((step) => (step.id === stepId ? ({ ...step, enabled } as WorkflowStepDefinition) : step)) });
  }
  function applyQuickPreset(id: string) {
    setQuickPreset(id);
    const steps = [...recipe.steps];
    if (recipe.id === "product-screenshot") {
      const preset = PRODUCT_QUICK_PRESETS.find((item) => item.id === id);
      const index = steps.findIndex((step) => step.action === "beautify");
      const exportIndex = steps.findIndex((step) => step.action === "export");
      if (preset && index >= 0) steps[index] = { ...steps[index], config: { ...steps[index].config, preset: preset.preset, canvas: preset.canvas, format: preset.format } } as WorkflowStepDefinition;
      if (preset && exportIndex >= 0) {
        const filename = preset.format === "png" ? "product-screenshot.png" : "product-screenshot.webp";
        steps[exportIndex] = { ...steps[exportIndex], config: { ...steps[exportIndex].config, filename } } as WorkflowStepDefinition;
      }
    }
    if (recipe.id === "web-ready") {
      const preset = WEB_READY_PRESETS.find((item) => item.id === id);
      if (!preset) return;
      const resizeIndex = steps.findIndex((step) => step.action === "resize");
      const compressIndex = steps.findIndex((step) => step.action === "compress");
      const exportIndex = steps.findIndex((step) => step.action === "export");
      if (resizeIndex >= 0) steps[resizeIndex] = { ...steps[resizeIndex], config: { ...steps[resizeIndex].config, width: preset.width } } as WorkflowStepDefinition;
      if (compressIndex >= 0) steps[compressIndex] = { ...steps[compressIndex], config: { ...steps[compressIndex].config, format: preset.format, quality: preset.quality } } as WorkflowStepDefinition;
      if (exportIndex >= 0) steps[exportIndex] = { ...steps[exportIndex], config: { ...steps[exportIndex].config, filename: preset.format === "png" ? "web-ready.png" : "web-ready.webp" } } as WorkflowStepDefinition;
    }
    commitRecipe({ ...recipe, steps });
  }
  function configureCurrent(config: WorkflowStepDefinition["config"]) {
    const index = snapshot.state.currentIndex;
    if (!recipe.steps[index]) return;
    const steps = [...recipe.steps];
    steps[index] = { ...steps[index], config } as WorkflowStepDefinition;
    commitRecipe({ ...recipe, steps });
    setSettingsVersion((value) => value + 1);
  }
  function setPrivacyConfig(next: PrivacyScanConfig) { setPrivacyConfigState(next); if (typeof window !== "undefined") saveCustomRules(window.localStorage, next.customRules); }
  function updatePrivacyFindings(findings: PrivacyFinding[]) {
    if (!activeId || !privacyResult) return;
    runtime.privacyScans.put({ ...privacyResult, findings }); setPrivacyVersion((value) => value + 1);
  }
  async function rerunPrivacyScan() {
    if (!activeId || privacyScanning) return;
    setPrivacyScanning(true);
    try { const next = await runtime.scanPrivacy(activeId, privacyConfig, setPrivacyStage); setCurrentFindingId(next.findings[0]?.id ?? null); setPrivacyVersion((value) => value + 1); }
    catch { /* Runtime reports a masked, user-facing scan status. */ }
    finally { setPrivacyScanning(false); setPrivacyStage(undefined); }
  }
  async function applyPrivacyFindings() {
    if (!activeId || !privacyResult) return;
    const selected = privacyResult.findings.filter((finding) => finding.selected && !finding.ignored);
    // The detector tables are only reachable here once a scan has produced findings.
    const { findingsToRegions } = await import("@/core/privacy/detectors");
    findingsToRegions(selected).forEach((region) => addRedaction(activeId, region, "blackout"));
    setPrivacyAppliedSubtypes((current) => [...new Set([...current, ...selected.map((finding) => finding.subtype)])]);
    updatePrivacyFindings(privacyResult.findings.map((finding) => finding.selected ? { ...finding, selected: false, applied: true } : finding));
  }
  const approve = () => engine.confirmReview({ notes, title, captions: JSON.stringify(captions), privacyAppliedSubtypes: JSON.stringify(privacyAppliedSubtypes) }).then(() => setSheet(null));
  const skip = () => engine.skip().then(() => setSheet(null));
  const completed = status === "completed";
  const outputsReady = outputs.outputs(snapshot.context.outputIds);
  const privacyReview = current?.action === "privacy-review" ? <PrivacyReview config={privacyConfig} result={privacyResult} scanning={privacyScanning} stage={privacyStage} currentFindingId={currentFindingId} hideLow={hideLow} onConfig={setPrivacyConfig} onScan={() => void rerunPrivacyScan()} onCancel={() => void runtime.cancelPrivacyScan()} onUpdateFindings={updatePrivacyFindings} onCurrent={setCurrentFindingId} onHideLow={setHideLow} onApply={() => void applyPrivacyFindings()} /> : undefined;
  const inspector = <RunnerSettings recipe={recipe} current={current} snapshot={snapshot} activeId={activeId} frame={frame} privacyReview={privacyReview} notes={notes} title={title} captions={captions} files={snapshot.context.assetIds.map((id) => files[id]).filter(Boolean)} allFiles={order.map((id) => files[id]).filter(Boolean)} setNotes={setNotes} setTitle={setTitle} setCaptions={setCaptions} onConfigureCurrent={configureCurrent} onApprove={() => void approve()} onRetry={() => void engine.retry()} onSkip={() => void skip()} onCancel={() => void engine.cancel()} onRestart={() => void engine.restart()} />;
  const doneCount = snapshot.state.steps.filter((step) => step.status === "completed" || step.status === "skipped").length;
  const inputs = (compact: boolean) => (
    <WorkflowInputs
      recipe={recipe}
      inputIds={inputIds}
      onChange={(next) => void changeInputs(next)}
      compact={compact}
      reorderable={idle || atInputReview}
      locked={inputsLocked}
      note={inputNotice ?? (changeRestarts ? "Changing a screenshot now restarts the steps that used it. Your settings are kept." : undefined)}
    />
  );

  return <div className="min-h-dvh" data-testid="workflow-runner">
    <WorkspaceSiteHeader />
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1480px] items-center gap-3 px-4 py-4 sm:gap-4 lg:px-6">
        <Button variant="ghost" size="sm" onClick={onExit} className="max-sm:px-2"><ArrowLeft /> Workflows</Button>
        <span aria-hidden className="h-7 w-px bg-line" />
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-5 max-sm:hidden">{iconFor(recipe)}</span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl">{recipe.name}</h1>
          <p className="t-body-sm text-ink-2 sm:truncate">{guideFor(recipe).outcome}</p>
        </div>
        <Badge tone={completed ? "success" : status === "failed" ? "error" : idle ? "neutral" : "accent"} dot className="ml-auto shrink-0 max-sm:hidden">
          {completed ? "Completed" : idle ? "Not started" : status === "failed" ? "Step failed" : `${doneCount} of ${recipe.steps.length} steps`}
        </Badge>
      </div>
      {!idle && <Progress value={snapshot.state.progress} label={`${recipe.name} progress`} />}
    </header>

    {idle ? (
      <main className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:py-10" data-testid="workflow-start">
        <WorkflowIntro recipe={recipe} className="lg:col-start-1 lg:row-start-1" />
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {inputs(false)}
          <div className="rounded-xl border border-line bg-surface p-5 shadow-xs">
            {inputNotice && <Notice tone="warning" className="mb-4">{inputNotice}</Notice>}
            {recipe.id === "product-screenshot" && <QuickPresetPicker label="Product preset" value={quickPreset} options={PRODUCT_QUICK_PRESETS} onChange={applyQuickPreset} />}
            {recipe.id === "web-ready" && <QuickPresetPicker label="Web target" value={quickPreset} options={WEB_READY_PRESETS} onChange={applyQuickPreset} />}
            <Button variant="primary" size="lg" className={cn("w-full", (recipe.id === "product-screenshot" || recipe.id === "web-ready") && "mt-5")} onClick={() => void start()} disabled={inputIds.length < recipe.input.min} data-testid="workflow-start-button">
              <Play /> Start {recipe.name}
            </Button>
            <p className="t-body-sm mt-2 text-center text-ink-3">
              {inputIds.length < recipe.input.min ? `Add ${recipe.input.min - inputIds.length === 1 ? "a screenshot" : `${recipe.input.min - inputIds.length} more screenshots`} to start.` : "You can stop or change screenshots at any time."}
            </p>
          </div>
        </aside>
        <WorkflowPlan recipe={recipe} onToggleStep={toggleStep} className="lg:col-start-1 lg:row-start-2" />
      </main>
    ) : (
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-[minmax(0,1fr)] gap-5 px-3 py-5 md:grid-cols-[250px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)_320px] lg:px-5 max-lg:pb-28">
        <aside className="min-w-0">
          <div className="space-y-4 md:sticky md:top-20 md:max-h-[calc(100dvh-6rem)] md:overflow-y-auto">
            {inputs(true)}
            <div className="hidden rounded-xl border border-line bg-surface p-3 shadow-xs md:block"><WorkflowStepper recipe={recipe} snapshot={snapshot} /></div>
          </div>
        </aside>
        <main className="min-w-0" aria-live="polite">
          {status === "failed" && <Notice tone="error" title={`${current?.name ?? "Workflow step"} didn’t finish`} className="mb-4">{messageFor(snapshot.state.error)} Completed steps are kept. Retry the step, change its settings, or restart.</Notice>}
          {status === "cancelled" && <Notice tone="neutral" title="Workflow cancelled" className="mb-4" actions={<Button variant="primary" onClick={() => void engine.restart()}><RotateCcw /> Start again</Button>}>Nothing else will run. Your screenshots are still in the workspace.</Notice>}
          {completed ? (
            <>
              <WorkflowCompletion
                recipe={recipe}
                checks={snapshot.context.checks}
                outputs={outputsReady}
                blobFor={(id) => outputs.blob(id)}
                onDownloadAll={() => downloadOutputs(outputs, snapshot.context.outputIds)}
                onDownload={(id) => downloadOutputs(outputs, [id])}
                onRunAgain={() => void engine.restart()}
                onExit={onExit}
              />
              {activeId && <ContinueWith tools={["beautify", "annotate", "compare", "convert", "pdf"]} fileId={activeId} />}
            </>
          ) : (
            <>
              <CurrentStep recipe={recipe} snapshot={snapshot} onContinue={() => void approve()} onSkip={() => void skip()} />
              {current?.action === "privacy-review" && activeId ? <RedactionCanvas assetId={activeId} findings={privacyResult?.findings ?? []} currentFindingId={currentFindingId} onSelectFinding={setCurrentFindingId} />
                : current?.action === "redact-review" && activeId ? <RedactionCanvas assetId={activeId} />
                  : current?.action === "annotation-review" && activeId ? <AnnotateCanvas assetId={activeId} />
                    : current?.action === "beautify" && activeId ? <BeautifyStage assetId={activeId} />
                      : current?.action === "compare" && snapshot.context.assetIds.length >= 2 ? <CompareWorkflowStage assetA={snapshot.context.assetIds[0]} assetB={snapshot.context.assetIds[1]} />
                        : <StepPreview assetIds={snapshot.context.assetIds} />}
            </>
          )}
        </main>
        <aside className="hidden lg:block"><div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-xs">{desktopInspector ? inspector : null}</div></aside>
      </div>
    )}
    {!idle && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
      <div className="flex gap-2">
        <Button className="h-11 flex-1 md:hidden" onClick={() => setSheet("steps")}><ListChecks /> Steps <span className="t-mono text-[11px] text-ink-3">{Math.min(snapshot.state.currentIndex + 1, recipe.steps.length)}/{recipe.steps.length}</span></Button>
        {!completed && <Button className="h-11 flex-1" onClick={() => setSheet("settings")}><Settings2 /> Settings</Button>}
        {status === "waiting-review" && <Button variant="primary" className="h-11 flex-1" onClick={() => void approve()}>Continue <ArrowRight /></Button>}
        {completed && outputsReady.length > 0 && <Button variant="primary" className="h-11 flex-1" onClick={() => downloadOutputs(outputs, snapshot.context.outputIds)}><Download /> Download</Button>}
      </div>
    </div>}
    <BottomSheet open={sheet === "steps"} onOpenChange={(open) => setSheet(open ? "steps" : null)} title={`${recipe.name} steps`}><WorkflowStepper recipe={recipe} snapshot={snapshot} /></BottomSheet>
    <BottomSheet open={sheet === "settings"} onOpenChange={(open) => setSheet(open ? "settings" : null)} title={current?.name ?? "Workflow settings"}>{desktopInspector ? null : inspector}</BottomSheet>
  </div>;
}

/** What the current step is working on, when it has no editor of its own. */
function StepPreview({ assetIds }: { assetIds: string[] }) {
  const files = useWorkspace((state) => state.files);
  const shown = assetIds.filter((id) => files[id]);
  if (!shown.length) return null;
  if (shown.length === 1) {
    const file = files[shown[0]]!;
    return (
      <section aria-label="Preview" className="rounded-xl border border-line bg-surface p-3 shadow-xs sm:p-4">
        <div className="max-h-[65dvh] overflow-auto rounded-md border border-line bg-surface-2 p-3 sm:p-5">
          <div className="mx-auto" style={{ maxWidth: Math.min(file.width, 900) }}>
            <BitmapCanvas id={file.id} width={Math.min(file.width, 900)} label={`Preview of ${file.name}`} className="rounded-xs shadow-sm" />
          </div>
        </div>
        <p className="t-mono mt-2 truncate text-[12px] text-ink-3">{file.name} · {file.width} × {file.height} px</p>
      </section>
    );
  }
  return (
    <section aria-label="Preview" className="rounded-xl border border-line bg-surface p-3 shadow-xs sm:p-4">
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((id, index) => (
          <li key={id} className="overflow-hidden rounded-md border border-line bg-surface-2">
            <div className="max-h-64 overflow-hidden"><BitmapCanvas id={id} width={320} label={`Screenshot ${index + 1}: ${files[id]!.name}`} /></div>
            <p className="t-mono truncate border-t border-line bg-surface px-2 py-1.5 text-[11.5px] text-ink-2">{index + 1}. {files[id]!.name}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function useDesktopInspector() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}

function QuickPresetPicker({ label, value, options, onChange }: { label: string; value: string; options: readonly { id: string; label: string }[]; onChange(id: string): void }) {
  return <fieldset><legend className="t-micro mb-2 text-ink-3">{label}</legend><div className="grid grid-cols-2 gap-2">{options.map((option) => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)} className={cn("min-h-11 rounded-md border px-2 py-2 text-xs font-semibold transition", value === option.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface hover:border-line-strong")}>{option.label}</button>)}</div></fieldset>;
}

function RunnerSettings(props: {
  recipe: WorkflowRecipe; current?: WorkflowStepDefinition; snapshot: WorkflowEngineSnapshot; activeId: string | null; frame: ReturnType<typeof annotationFrame> | null;
  privacyReview?: ReactNode;
  notes: string; title: string; captions: Record<string, string>; files: { id: string; name: string }[]; allFiles: { id: string; name: string }[];
  setNotes(value: string): void; setTitle(value: string): void; setCaptions(value: Record<string, string>): void;
  onConfigureCurrent(config: WorkflowStepDefinition["config"]): void;
  onApprove(): void; onRetry(): void; onSkip(): void; onCancel(): void; onRestart(): void;
}) {
  const { current, snapshot, activeId, frame } = props;
  if (snapshot.state.status === "completed") return <p className="t-body text-ink-2">All steps are done. Your files are listed in the main panel, ready to download.</p>;
  if (snapshot.state.status === "failed") return <div className="space-y-3">{current && <div className="rounded-md border border-line bg-surface-3 p-3"><p className="t-micro text-ink-3">Change settings</p><StepConfig step={current} onChange={(next) => props.onConfigureCurrent(next.config)} /></div>}<Button variant="primary" className="w-full" onClick={props.onRetry}><RotateCcw /> Retry failed step</Button>{current?.optional && <Button className="w-full" onClick={props.onSkip}>Skip optional step</Button>}<Button className="w-full" onClick={props.onRestart}><RotateCcw /> Restart workflow</Button><Button variant="ghost" className="w-full" onClick={props.onCancel}>Cancel workflow</Button></div>;
  if (snapshot.state.status === "cancelled") return <Button variant="primary" className="w-full" onClick={props.onRestart}><RotateCcw /> Restart workflow</Button>;
  const hasOwnSettings = current && (["privacy-review", "redact-review", "annotation-review", "beautify", "compare", "watermark"] as WorkflowAction[]).includes(current.action);
  return <div data-testid="workflow-settings">
    {current && <div className="mb-4 border-b border-line pb-4"><p className="t-micro text-ink-3">Settings for this step</p><p className="mt-1 font-display text-lg">{current.name}</p>{!hasOwnSettings && !(props.recipe.id === "bug-report" && current.review) && !(props.recipe.id === "documentation-pack" && current.action === "input") && <p className="t-body-sm mt-1 text-ink-2">{snapshot.state.status === "running" ? "Nothing to set while this step runs." : "This step has no extra settings."}</p>}</div>}
    {props.privacyReview}
    {current?.action === "redact-review" && activeId && <RedactionInspector assetId={activeId} />}
    {current?.action === "annotation-review" && activeId && frame && <AnnotateInspector assetId={activeId} frame={frame} />}
    {current?.action === "beautify" && activeId && <BeautifyInspector assetId={activeId} />}
    {current?.action === "compare" && <CompareInspector />}
    {props.recipe.id === "bug-report" && current?.review && <div className="space-y-4 border-t border-line pt-4"><div><FieldLabel htmlFor="bug-title">Report title</FieldLabel><input id="bug-title" value={props.title} onChange={(event) => props.setTitle(event.target.value)} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm" /></div><div><FieldLabel htmlFor="bug-notes">Notes</FieldLabel><textarea id="bug-notes" value={props.notes} onChange={(event) => props.setNotes(event.target.value)} rows={4} className="w-full rounded-md border border-line bg-surface p-3 text-sm" placeholder="What did you expect? What happened instead?" /></div></div>}
    {props.recipe.id === "documentation-pack" && current?.action === "input" && <div className="space-y-3"><p className="t-body-sm text-ink-2">Change the order with the arrows in “Your screenshots”. Captions follow their screenshot.</p>{props.files.map((file, index) => <div key={file.id} className="rounded-md border border-line p-3"><p className="t-mono mb-2 truncate text-[12px]">{index + 1}. {file.name}</p><FieldLabel htmlFor={`caption-${file.id}`}>Screenshot {index + 1} caption</FieldLabel><input id={`caption-${file.id}`} value={props.captions[file.id] ?? ""} onChange={(event) => props.setCaptions({ ...props.captions, [file.id]: event.target.value })} className="h-11 w-full rounded-md border border-line px-3 text-sm" placeholder={file.name} /></div>)}</div>}
    {current?.action === "watermark" && <div className="space-y-2"><FieldLabel htmlFor="workflow-watermark">Overlay image</FieldLabel><select id="workflow-watermark" value={current.config.assetId ?? ""} onChange={(event) => props.onConfigureCurrent({ ...current.config, assetId: event.target.value || undefined })} className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm"><option value="">Choose a workspace image</option>{props.allFiles.filter((file) => file.id !== props.activeId).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select><p className="t-body-sm text-ink-2">Add the logo to your workspace, then select it here. It stays in this session.</p></div>}
    {snapshot.state.status === "waiting-review" && <div className="sticky bottom-0 mt-5 space-y-2 border-t border-line bg-surface pt-4">{current?.destructive && <p className="rounded-md bg-warning-soft p-3 text-xs leading-relaxed text-warning">Continuing creates a new, flattened copy. Your original screenshot stays unchanged.</p>}<Button variant="primary" size="lg" className="w-full" onClick={props.onApprove}>Approve and continue <ArrowRight /></Button>{current?.optional && <Button className="w-full" onClick={props.onSkip}>Skip optional step</Button>}<Button variant="ghost" className="w-full" onClick={props.onCancel}>Cancel workflow</Button></div>}
    {snapshot.state.status === "running" && current && <div role="status" className="rounded-md border border-accent-line bg-accent-soft p-4 text-sm text-accent-ink"><Loader2 aria-hidden className="mr-2 inline size-4 animate-spin" />{runningCopy(current)}</div>}
  </div>;
}
