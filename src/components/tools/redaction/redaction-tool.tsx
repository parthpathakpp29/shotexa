"use client";

import { Copy, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; verification: SafeShareVerification; regionCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfigState] = useState<PrivacyScanConfig>(() => ({ ...DEFAULT_PRIVACY_SCAN, enabledCategories: [...DEFAULT_PRIVACY_SCAN.enabledCategories], customRules: typeof window === "undefined" ? [] : parseCustomRules(window.localStorage.getItem(PRIVACY_RULES_STORAGE_KEY)) }));
  const [scanResult, setScanResult] = useState<PrivacyScanResult | null>(() => selectedId ? runtime.privacyScans.forAsset(selectedId) ?? null : null);
  const [scanning, setScanning] = useState(false);
  const [scanStage, setScanStage] = useState<string>();
  const [currentFindingId, setCurrentFindingId] = useState<string | null>(scanResult?.findings[0]?.id ?? null);
  const [hideLow, setHideLow] = useState(false);
  const [appliedSubtypes, setAppliedSubtypes] = useState<string[]>([]);
  const [verificationWarning, setVerificationWarning] = useState<string | null>(null);
  const activeScanResult = scanResult?.assetId === selectedId ? scanResult : selectedId ? runtime.privacyScans.forAsset(selectedId) ?? null : null;

  useEffect(() => setMode(defaultMode), [defaultMode, setMode]);

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
    setAppliedSubtypes([...new Set([...appliedSubtypes, ...selected.map((finding) => finding.subtype)])]);
    updateFindings(activeScanResult.findings.map((finding) => finding.selected ? { ...finding, selected: false, applied: true } : finding));
    toast({ type: "success", message: "Redactions applied", description: `${regions.length} editable region${regions.length === 1 ? "" : "s"} added. Review them before flattening.` });
  }

  async function exportSafeCopy() {
    if (!selectedId || !operations.length || busy) return;
    const regionCount = operations.length;
    setBusy(true);
    setError(null);
    try {
      const exported = await runtime.exportSafeShare(selectedId);
      setResult({ id: exported.id, verification: exported.verification, regionCount });
      if (appliedSubtypes.length) {
        try {
          const verifiedOcr = await runtime.extractText(exported.id, undefined, true);
          const residual = detectSensitiveText(verifiedOcr.result, config).filter((finding) => appliedSubtypes.includes(finding.subtype) && finding.confidence !== "low");
          setVerificationWarning(residual.length ? "Sensitive text may still be visible. Review the flattened output before sharing." : null);
        } catch {
          setVerificationWarning("The pixels and metadata were verified, but the optional post-export text check could not run. Review before sharing.");
        }
      }
      downloadAsset(runtime, exported.id);
    } catch (e) {
      setError((e as { code?: string }).code === "REDACTION_MEMORY_PRESSURE" ? "This image is too large for a safe export on this device. Try a smaller image or PNG output." : "Safe Share could not export this image. Your original is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPng() {
    if (!result) return;
    const blob = runtime.registry.blob(result.id);
    if (!blob || blob.type !== "image/png" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      toast({ type: "error", message: "Copy PNG is not supported for this output. Download remains available." }); return;
    }
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); toast({ type: "success", message: "Flattened PNG copied" }); }
    catch { toast({ type: "error", message: "Could not copy PNG. Download remains available." }); }
  }

  if (!selectedId || !file) return null;
  const verification = result?.verification ?? null;
  return (
    <WorkspaceShell
      tool={tool}
      status={<Badge tone={result ? "success" : operations.length || activeScanResult?.findings.length ? "accent" : "neutral"} dot>{result ? "Safe Share Ready" : operations.length ? `${operations.length} region${operations.length === 1 ? "" : "s"} selected` : activeScanResult?.findings.length ? `${activeScanResult.findings.length} findings to review` : "Ready to redact"}</Badge>}
      fileHint="Select a screenshot or a previous Shotexa result. Redactions stay editable until export."
      inspectorTitle="Safe Share controls"
      exportAction={{ label: tool === "blur" ? "Export Blurred Copy" : "Export Safe Copy", onClick: exportSafeCopy, disabled: !operations.length, busy }}
      canvas={
        <>
          <h1 className="sr-only">{TOOLS[tool].seo.h1}</h1>
          {error && <div role="alert" className="mb-3 rounded-md border border-error/20 bg-error-soft px-4 py-3 text-sm text-error">{error}</div>}
          <RedactionCanvas assetId={selectedId} findings={activeScanResult?.findings ?? []} currentFindingId={currentFindingId} onSelectFinding={setCurrentFindingId} />
        </>
      }
      inspector={<><PrivacyReview config={config} result={activeScanResult} scanning={scanning} stage={scanStage} currentFindingId={currentFindingId} hideLow={hideLow} onConfig={setConfig} onScan={() => void runScan()} onCancel={() => void runtime.cancelPrivacyScan()} onUpdateFindings={updateFindings} onCurrent={setCurrentFindingId} onHideLow={setHideLow} onApply={applySelected} /><RedactionInspector assetId={selectedId} verification={verification} /></>}
      below={
        result && (
          <div data-testid="safe-share-result">
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#cfe5d6] bg-success-soft p-4 text-success">
              <ShieldCheck className="size-5" />
              <div><p className="text-sm font-medium">Flattened copy verified and downloaded. The result is now available to other Shotexa tools.</p><p className="mt-1 text-xs">{result.regionCount} selected region{result.regionCount === 1 ? "" : "s"} flattened · metadata removed · export generated · redaction layers are no longer editable</p></div>
            </div>
            {verificationWarning && <div role="alert" className="mt-3 rounded-md border border-[#f0dcb4] bg-warning-soft px-4 py-3 text-sm text-warning">{verificationWarning}</div>}
            {runtime.store.getState().files[result.id]?.type === "image/png" && <Button variant="secondary" className="mt-3" onClick={() => void copyPng()} data-testid="safe-share-copy-png"><Copy /> Copy PNG</Button>}
            <ContinueWith tools={continuationsFor(tool)} fileId={result.id} />
          </div>
        )
      }
    />
  );
}
