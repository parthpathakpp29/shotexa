"use client";

import { ArrowLeft, Copy, Download, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { continuationsFor, TOOLS } from "@/config/tools";
import { downloadAsset } from "@/core/runtime/runtime";
import type { RedactionMode, SafeShareVerification } from "@/core/redaction/types";
import { detectSensitiveText, findingsToRegions } from "@/core/privacy/detectors";
import { parseCustomRules, PRIVACY_RULES_STORAGE_KEY, saveCustomRules } from "@/core/privacy/custom-rules";
import { DEFAULT_PRIVACY_SCAN } from "@/core/privacy/presets";
import type { PrivacyFinding, PrivacyScanConfig, PrivacyScanResult } from "@/core/privacy/types";
import { RedactionCanvas } from "./redaction-canvas";
import { RedactionInspector } from "./redaction-inspector";
import { PrivacyReview } from "./privacy-review";

const EMPTY_REDACTIONS: never[] = [];

export function RedactionTool({ tool, defaultMode, landing }: { tool: "safe-share" | "blur"; defaultMode: RedactionMode; landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <RedactionWorkspace tool={tool} defaultMode={defaultMode} />;
}

function RedactionWorkspace({ tool, defaultMode }: { tool: "safe-share" | "blur"; defaultMode: RedactionMode }) {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const operations = useWorkspace((s) => (s.selectedId ? s.redaction.byAsset[s.selectedId] ?? EMPTY_REDACTIONS : EMPTY_REDACTIONS));
  const setMode = useWorkspace((s) => s.setRedactionMode);
  const addRedaction = useWorkspace((s) => s.addRedaction);
  const selectFile = useWorkspace((s) => s.select);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; sourceId: string; verification: SafeShareVerification; regionCount: number } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);
  const pendingResult = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfigState] = useState<PrivacyScanConfig>(() => ({ ...DEFAULT_PRIVACY_SCAN, enabledCategories: [...DEFAULT_PRIVACY_SCAN.enabledCategories], customRules: typeof window === "undefined" ? [] : parseCustomRules(window.localStorage.getItem(PRIVACY_RULES_STORAGE_KEY)) }));
  const [scanResult, setScanResult] = useState<PrivacyScanResult | null>(() => selectedId ? runtime.privacyScans.forAsset(selectedId) ?? null : null);
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState<string>();
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(scanResult?.findings[0]?.id ?? null);
  const [hideLow, setHideLow] = useState(false);
  const [appliedSubtypes, setAppliedSubtypes] = useState<Record<string, string[]>>({});
  const [verificationWarning, setVerificationWarning] = useState<string | null>(null);
  const activeScanResult = scanResult?.assetId === selectedId ? scanResult : selectedId ? runtime.privacyScans.forAsset(selectedId) ?? null : null;

  useEffect(() => setMode(defaultMode), [defaultMode, setMode]);
  useEffect(() => () => { if (pendingResult.current) runtime.discardPreparedSafeShare(pendingResult.current); }, [runtime]);

  function setConfig(next: PrivacyScanConfig) {
    setConfigState(next);
    if (typeof window !== "undefined") saveCustomRules(window.localStorage, next.customRules);
  }

  function updateFindings(findings: PrivacyFinding[]) {
    if (!selectedId || !activeScanResult) return;
    const next = { ...activeScanResult, findings };
    runtime.privacyScans.put(next);
    setScanResult(next);
  }

  async function runScan() {
    if (!selectedId || scanning) return;
    setScanning(true); setError(null); setVerificationWarning(null);
    try {
      const scan = await runtime.scanPrivacy(selectedId, config, setScanStage);
      setScanResult(scan); setCurrentFindingId(scan.findings[0]?.id ?? null);
    } catch (cause) {
      if ((cause as { code?: string }).code !== "PRIVACY_SCAN_CANCELLED") setError("Privacy scan could not finish. Manual redaction remains available.");
    } finally { setScanning(false); setScanStage(undefined); }
  }

  function applySelected() {
    if (!selectedId || !activeScanResult) return;
    const selected = activeScanResult.findings.filter((finding) => finding.selected && !finding.ignored);
    const regions = findingsToRegions(selected);
    for (const region of regions) addRedaction(selectedId, region, "blackout");
    setAppliedSubtypes((current) => ({ ...current, [selectedId]: [...new Set([...(current[selectedId] ?? []), ...selected.filter((finding) => finding.detector !== "face" && finding.detector !== "barcode").map((finding) => finding.subtype)])] }));
    updateFindings(activeScanResult.findings.map((finding) => finding.selected ? { ...finding, selected: false, applied: true } : finding));
    toast({ type: "success", message: "Redactions applied", description: `${regions.length} editable region${regions.length === 1 ? "" : "s"} added. Review them before flattening.` });
  }

  async function exportSafeCopy() {
    if (!selectedId || !operations.length || busy) return;
    const sourceId = selectedId;
    const regionCount = operations.length;
    setBusy(true);
    setError(null);
    setVerificationWarning(null);
    try {
      if (pendingResult.current) runtime.discardPreparedSafeShare(pendingResult.current);
      pendingResult.current = null;
      const exported = await runtime.prepareSafeShare(selectedId);
      pendingResult.current = exported.id;
      setResult({ id: exported.id, sourceId, verification: exported.verification, regionCount });
      setReviewed(false);
      setViewingResult(true);
    } catch (e) {
      setError((e as { code?: string }).code === "REDACTION_MEMORY_PRESSURE" ? "This image is too large for a safe export on this device. Try a smaller image or PNG output." : "Safe Share could not export this image. Your original is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReview() {
    if (!result || reviewed || reviewing) return;
    setReviewing(true);
    try {
      runtime.publishPreparedSafeShare(result.id);
      pendingResult.current = null;
      setReviewed(true);
      const sourceSubtypes = appliedSubtypes[result.sourceId] ?? [];
      if (sourceSubtypes.length) {
        try {
          const verifiedOcr = await runtime.extractText(result.id, undefined, true);
          const residual = detectSensitiveText(verifiedOcr.result, config).filter((finding) => sourceSubtypes.includes(finding.subtype) && finding.confidence !== "low");
          setVerificationWarning(residual.length ? "Sensitive text may still be visible. Review the flattened output before sharing." : null);
        } catch {
          setVerificationWarning("The pixels and metadata were verified, but the optional post-export text check could not run. Review before sharing.");
        }
      }
    } catch {
      setError("The prepared image is no longer available. Prepare a new safe copy and review it again.");
    } finally {
      setReviewing(false);
    }
  }

  function adjustRegions() {
    if (!result) return;
    if (pendingResult.current) runtime.discardPreparedSafeShare(pendingResult.current);
    pendingResult.current = null;
    setViewingResult(false);
    selectFile(result.sourceId);
  }

  async function copyPng() {
    if (!result || !reviewed || reviewing) return;
    const blob = runtime.registry.blob(result.id);
    if (!blob || blob.type !== "image/png" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      toast({ type: "error", message: "Copy PNG is not supported for this output. Download remains available." }); return;
    }
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); toast({ type: "success", message: "Flattened PNG copied" }); }
    catch { toast({ type: "error", message: "Could not copy PNG. Download remains available." }); }
  }

  if (!selectedId || !file) return null;
  const showingResult = Boolean(result && viewingResult && (selectedId === result.id || (!reviewed && selectedId === result.sourceId)));
  const verification = showingResult ? result?.verification ?? null : null;
  return (
    <WorkspaceShell
      tool={tool}
      status={<Badge tone={showingResult ? "success" : operations.length || activeScanResult?.findings.length ? "accent" : "neutral"} dot>{showingResult ? "Review safe copy" : operations.length ? `${operations.length} region${operations.length === 1 ? "" : "s"} selected` : activeScanResult?.findings.length ? `${activeScanResult.findings.length} findings to review` : "Ready to redact"}</Badge>}
      fileHint="Select a screenshot or a previous Shotexa result. Redactions stay editable until export."
      inspectorTitle="Safe Share controls"
      exportAction={{ label: showingResult ? "Download Reviewed Copy" : "Prepare Safe Copy", onClick: showingResult && result ? () => downloadAsset(runtime, result.id) : exportSafeCopy, disabled: showingResult ? !reviewed || reviewing : !operations.length, busy }}
      canvas={
        <>
          <h1 className="sr-only">{TOOLS[tool].seo.h1}</h1>
          {error && <div role="alert" className="mb-3 rounded-md border border-error/20 bg-error-soft px-4 py-3 text-sm text-error">{error}</div>}
          {showingResult && result ? <section aria-label="Final sanitized image" className="rounded-lg border border-line bg-surface p-3">
            <Image unoptimized src={runtime.registry.objectUrl(result.id) ?? ""} alt="Final flattened and metadata-cleaned result" width={file.width} height={file.height} className="mx-auto max-h-[70dvh] max-w-full object-contain" />
            <p className="mt-3 text-center text-sm text-ink-2">Inspect every corner before sharing. Automatic detection can miss sensitive details.</p>
            <details className="mx-auto mt-3 max-w-3xl rounded-md border border-line p-3"><summary className="cursor-pointer text-sm font-medium">Compare before and after</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><div><p className="mb-1 text-xs text-ink-3">Original</p>{runtime.registry.objectUrl(result.sourceId) ? <Image unoptimized src={runtime.registry.objectUrl(result.sourceId)!} alt="Original image before redaction" width={file.width} height={file.height} className="w-full rounded border border-line object-contain" /> : <p className="text-sm text-ink-3">Original no longer in workspace.</p>}</div><div><p className="mb-1 text-xs text-ink-3">Sanitized</p><Image unoptimized src={runtime.registry.objectUrl(result.id) ?? ""} alt="Sanitized image after redaction" width={file.width} height={file.height} className="w-full rounded border border-line object-contain" /></div></div></details>
            <label className="mx-auto mt-4 flex min-h-11 max-w-xl items-start gap-3 rounded-md border border-line p-3 text-sm"><input type="checkbox" className="mt-1 size-4" checked={reviewed} disabled={reviewed || reviewing} onChange={(event) => { if (event.target.checked) void confirmReview(); }} /> {reviewing ? "Checking the reviewed image…" : "I inspected the final image and it is safe to share"}</label>
          </section> : <RedactionCanvas assetId={selectedId} findings={activeScanResult?.findings ?? []} currentFindingId={currentFindingId} onSelectFinding={setCurrentFindingId} />}
        </>
      }
      inspector={showingResult && result ? <div className="space-y-4 p-4"><h2 className="text-base font-semibold">Review final pixels</h2><p className="text-sm text-ink-2">The image above is the actual flattened output. The original remains editable in your workspace.</p><Button variant="secondary" onClick={adjustRegions}><ArrowLeft /> Adjust regions</Button></div> : <><PrivacyReview config={config} result={activeScanResult} scanning={scanning} stage={scanStage} currentFindingId={currentFindingId} hideLow={hideLow} onConfig={setConfig} onScan={() => void runScan()} onCancel={() => void runtime.cancelPrivacyScan()} onUpdateFindings={updateFindings} onCurrent={setCurrentFindingId} onHideLow={setHideLow} onApply={applySelected} /><RedactionInspector assetId={selectedId} verification={verification} /></>}
      below={
        showingResult && result && (
          <div data-testid="safe-share-result">
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#cfe5d6] bg-success-soft p-4 text-success">
              <ShieldCheck className="size-5" />
              <div><p className="text-sm font-medium">Flattened copy prepared. Review it before downloading or continuing.</p><p className="mt-1 text-xs">{result.regionCount} selected region{result.regionCount === 1 ? "" : "s"} flattened · metadata removed · export generated · redaction layers are no longer editable</p></div>
            </div>
            {verificationWarning && <div role="alert" className="mt-3 rounded-md border border-[#f0dcb4] bg-warning-soft px-4 py-3 text-sm text-warning">{verificationWarning}</div>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-success"><span className="rounded-full border border-line px-3 py-1">Redactions flattened</span><span className="rounded-full border border-line px-3 py-1">Privacy metadata removed</span><span className="rounded-full border border-line px-3 py-1">Output verified</span></div>
            {reviewed && !reviewing && <div className="mt-3 flex flex-wrap gap-2"><Button variant="primary" onClick={() => downloadAsset(runtime, result.id)}><Download /> Download reviewed copy</Button>{runtime.store.getState().files[result.id]?.type === "image/png" && <Button variant="secondary" onClick={() => void copyPng()} data-testid="safe-share-copy-png"><Copy /> Copy PNG</Button>}</div>}
            {reviewed && !reviewing && <ContinueWith tools={continuationsFor(tool)} fileId={result.id} />}
          </div>
        )
      }
    />
  );
}
