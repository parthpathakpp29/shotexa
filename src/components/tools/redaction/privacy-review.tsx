"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff, Loader2, Plus, RotateCcw, ScanSearch, ShieldCheck, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/controls";
import { FieldLabel, InspectorSection, Notice } from "@/components/ui/primitives";
import { PRIVACY_PRESETS, privacyConfigForPreset } from "@/core/privacy/presets";
import { validateCustomPattern } from "@/core/privacy/safe-regex";
import type { PrivacyCategory, PrivacyCustomRule, PrivacyFinding, PrivacyPresetId, PrivacyScanConfig, PrivacyScanResult } from "@/core/privacy/types";
import { cn } from "@/lib/cn";

const CATEGORY_LABELS: Record<PrivacyCategory, string> = { personal: "Personal", financial: "Financial", developer: "Developer", network: "Network", visual: "Visual" };

export interface PrivacyReviewProps {
  config: PrivacyScanConfig;
  result: PrivacyScanResult | null;
  scanning: boolean;
  stage?: string;
  currentFindingId: string | null;
  hideLow: boolean;
  onConfig(config: PrivacyScanConfig): void;
  onScan(): void;
  onCancel(): void;
  onUpdateFindings(findings: PrivacyFinding[]): void;
  onCurrent(id: string | null): void;
  onHideLow(value: boolean): void;
  onApply(): void;
}

export function PrivacyReview({ config, result, scanning, stage, currentFindingId, hideLow, onConfig, onScan, onCancel, onUpdateFindings, onCurrent, onHideLow, onApply }: PrivacyReviewProps) {
  const findings = result?.findings ?? [];
  const visible = findings.filter((finding) => !finding.ignored && !finding.applied && (!hideLow || finding.confidence !== "low"));
  const selectedCount = findings.filter((finding) => finding.selected && !finding.ignored && !finding.applied).length;
  const currentIndex = visible.findIndex((finding) => finding.id === currentFindingId);
  const patch = (id: string, values: Partial<PrivacyFinding>) => onUpdateFindings(findings.map((finding) => finding.id === id ? { ...finding, ...values } : finding));
  const selectCategory = (category: PrivacyCategory, selected: boolean) => onUpdateFindings(findings.map((finding) => finding.category === category && !finding.ignored ? { ...finding, selected } : finding));
  const categories = [...new Set(findings.filter((finding) => !finding.ignored && !finding.applied).map((finding) => finding.category))];

  return <div data-testid="privacy-review">
    <InspectorSection title="Privacy Scan">
      <FieldLabel htmlFor="privacy-preset">Scan preset</FieldLabel>
      <select id="privacy-preset" value={config.preset} disabled={scanning} onChange={(event) => onConfig({ ...privacyConfigForPreset(event.target.value as PrivacyPresetId), customRules: config.customRules })} className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-sm">
        {PRIVACY_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
      </select>
      <p className="t-body-sm mt-2 text-ink-2">{PRIVACY_PRESETS.find((preset) => preset.id === config.preset)?.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["personal", "financial", "developer", "network", "visual"] as PrivacyCategory[]).map((category) => <label key={category} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={config.enabledCategories.includes(category)} onChange={(event) => onConfig({ ...config, enabledCategories: event.target.checked ? [...config.enabledCategories, category] : config.enabledCategories.filter((item) => item !== category) })} />{CATEGORY_LABELS[category]}</label>)}
      </div>
      {config.enabledCategories.includes("visual") && <div className="mt-3 space-y-2 rounded-md border border-line p-3">
        <p className="text-xs font-semibold text-ink-2">Visual suggestions</p>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(config.detectFaces)} onChange={(event) => onConfig({ ...config, detectFaces: event.target.checked })} /> Find faces locally</label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(config.detectPlateText)} onChange={(event) => onConfig({ ...config, detectPlateText: event.target.checked })} /> Suggest readable Indian plate text</label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={config.detectBarcodes} onChange={(event) => onConfig({ ...config, detectBarcodes: event.target.checked })} /> Find QR and barcodes</label>
        <p className="text-xs text-ink-3">Plate text is an OCR clue, not a vehicle detector. Draw a region manually for other, unreadable, or missed plates.</p>
      </div>}
      {scanning ? <div className="mt-4"><Button className="w-full" variant="secondary" onClick={onCancel}><X /> Cancel scan</Button><p role="status" aria-live="polite" className="mt-3 flex items-center gap-2 text-sm text-ink-2"><Loader2 className="size-4 animate-spin" /> {stage ?? "Reading screenshot…"}</p></div>
        : <Button variant="primary" size="lg" className="mt-4 w-full" onClick={onScan} disabled={!config.enabledCategories.length}><ScanSearch /> {result ? "Scan again" : "Scan screenshot"}</Button>}
      <p className="t-body-sm mt-3 text-ink-3">Detection is deterministic and local. Findings are suggestions for review, not a guarantee that everything sensitive was found.</p>
    </InspectorSection>

    {result && <>
      <InspectorSection title={`${findings.filter((finding) => !finding.ignored && !finding.applied).length} possible sensitive item${findings.filter((finding) => !finding.ignored && !finding.applied).length === 1 ? "" : "s"}`} action={<button type="button" className="text-xs font-medium text-accent-ink" onClick={() => onUpdateFindings(findings.map((finding) => ({ ...finding, selected: false })))}>Clear all</button>}>
        <div aria-live="polite" className="sr-only">{selectedCount} findings selected for redaction</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onUpdateFindings(findings.map((finding) => finding.ignored || finding.applied ? finding : { ...finding, selected: true }))}>Select all</Button>
          <Button size="sm" variant="ghost" onClick={() => onHideLow(!hideLow)}>{hideLow ? <Eye /> : <EyeOff />} {hideLow ? "Show low" : "Hide low"}</Button>
          {findings.some((finding) => finding.ignored) && <Button size="sm" variant="ghost" onClick={() => onUpdateFindings(findings.map((finding) => ({ ...finding, ignored: false })))}><RotateCcw /> Restore ignored</Button>}
        </div>
        {categories.map((category) => <div key={category} className="mt-4"><div className="mb-2 flex items-center justify-between"><strong className="text-sm">{CATEGORY_LABELS[category]}</strong><span className="flex gap-2"><button type="button" className="text-xs text-accent-ink" onClick={() => selectCategory(category, true)}>Select</button><button type="button" className="text-xs text-ink-3" onClick={() => onUpdateFindings(findings.map((finding) => finding.category === category ? { ...finding, ignored: true, selected: false } : finding))}>Ignore category</button></span></div>
          <ul className="space-y-2" aria-label={`${CATEGORY_LABELS[category]} findings`}>{visible.filter((finding) => finding.category === category).map((finding) => <li key={finding.id} className={cn("rounded-md border p-2", currentFindingId === finding.id ? "border-accent bg-accent-soft" : "border-line")}>
            <div className="flex min-h-11 items-start gap-2"><input type="checkbox" aria-label={`Redact ${finding.label}`} className="mt-1 size-5 accent-[var(--accent)]" checked={finding.selected} onChange={(event) => patch(finding.id, { selected: event.target.checked })} /><button type="button" className="min-w-0 flex-1 text-left" onClick={() => onCurrent(finding.id)}><span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{finding.label}</span><span className={cn("text-[10px] uppercase tracking-wide", finding.confidence === "high" ? "text-success" : finding.confidence === "medium" ? "text-warning" : "text-ink-3")}>{finding.confidence}</span></span><span className="t-mono mt-0.5 block truncate text-[10.5px] text-ink-3">{finding.maskedValue}</span><span className="t-body-sm mt-1 block text-ink-2">{finding.reason}</span></button><button type="button" aria-label={`Ignore ${finding.label}`} className="size-10 shrink-0 rounded-md text-ink-3 hover:bg-surface-2" onClick={() => patch(finding.id, { ignored: true, selected: false })}><Trash2 className="mx-auto size-4" /></button></div>
          </li>)}</ul>
        </div>)}
        {visible.length > 0 && <div className="mt-4 flex items-center justify-between"><Button size="sm" variant="ghost" disabled={currentIndex <= 0} onClick={() => onCurrent(visible[Math.max(0, currentIndex - 1)]?.id ?? visible[0].id)}><ChevronLeft /> Previous</Button><span className="t-mono text-[10px] text-ink-3">{currentIndex >= 0 ? `${currentIndex + 1} / ${visible.length}` : `${visible.length} findings`}</span><Button size="sm" variant="ghost" disabled={currentIndex >= visible.length - 1} onClick={() => onCurrent(visible[Math.min(visible.length - 1, currentIndex + 1)]?.id ?? visible[0].id)}>Next <ChevronRight /></Button></div>}
        <Button variant="primary" size="lg" className="mt-5 w-full" disabled={!selectedCount} onClick={onApply}><ShieldCheck /> Redact Selected ({selectedCount})</Button>
        <Notice tone="warning" title="Blackout is safest" className="mt-3">Blur and pixelation can remain visually reversible in some circumstances. Shotexa recommends Blackout for irreversible sharing.</Notice>
        {result.barcodeSupport === "unsupported" && config.detectBarcodes && <p className="t-body-sm mt-3 flex gap-2 text-ink-3"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> QR and barcode detection is not available in this browser. Text detection still completed.</p>}
        {result.faceSupport === "unavailable" && <p role="alert" className="t-body-sm mt-3 flex gap-2 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Face detection was unavailable on this device. Draw redaction regions manually.</p>}
        {result.faceSupport === "too-large" && <p role="alert" className="t-body-sm mt-3 flex gap-2 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> This image is too large for a safe face scan on this device. Draw redaction regions manually.</p>}
      </InspectorSection>
    </>}
    <CustomRuleEditor config={config} onConfig={onConfig} />
  </div>;
}

function CustomRuleEditor({ config, onConfig }: { config: PrivacyScanConfig; onConfig(config: PrivacyScanConfig): void }) {
  const [name, setName] = useState(""); const [pattern, setPattern] = useState(""); const [category, setCategory] = useState<Exclude<PrivacyCategory, "visual">>("personal"); const [caseSensitive, setCaseSensitive] = useState(false);
  const validation = pattern ? validateCustomPattern(pattern, caseSensitive) : { ok: false as const };
  function add() {
    if (!name.trim() || !validation.ok) return;
    const rule: PrivacyCustomRule = { id: crypto.randomUUID(), name: name.trim().slice(0, 48), pattern, category, caseSensitive, enabled: true };
    onConfig({ ...config, customRules: [...config.customRules, rule].slice(0, 25) }); setName(""); setPattern("");
  }
  return <Disclosure title="Custom detection rules"><p className="t-body-sm mb-3 text-ink-2">Rules stay in this browser. Matches are masked in the review list.</p>{config.customRules.map((rule) => <div key={rule.id} className="mb-2 flex min-h-11 items-center gap-2 rounded-md border border-line px-2"><input type="checkbox" aria-label={`Enable ${rule.name}`} checked={rule.enabled} onChange={(event) => onConfig({ ...config, customRules: config.customRules.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item) })} /><span className="min-w-0 flex-1 truncate text-sm">{rule.name}</span><button type="button" aria-label={`Delete ${rule.name}`} className="size-10 rounded-md hover:bg-surface-2" onClick={() => onConfig({ ...config, customRules: config.customRules.filter((item) => item.id !== rule.id) })}><Trash2 className="mx-auto size-4" /></button></div>)}
    <label className="block"><span className="t-micro text-ink-3">Rule name</span><input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-line px-3" placeholder="Customer ID" /></label><label className="mt-3 block"><span className="t-micro text-ink-3">Pattern</span><input value={pattern} maxLength={200} onChange={(event) => setPattern(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-line px-3 font-mono text-sm" placeholder="CUST-[0-9]{8}" /></label>{pattern && !validation.ok && <p role="alert" className="mt-1 text-xs text-error">{validation.error}</p>}<div className="mt-3 grid grid-cols-2 gap-2"><select aria-label="Custom rule category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="min-h-11 rounded-md border border-line px-2"><option value="personal">Personal</option><option value="financial">Financial</option><option value="developer">Developer</option><option value="network">Network</option></select><label className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 text-sm"><input type="checkbox" checked={caseSensitive} onChange={(event) => setCaseSensitive(event.target.checked)} /> Case sensitive</label></div><Button size="sm" className="mt-3 w-full" disabled={!name.trim() || !validation.ok} onClick={add}><Plus /> Add local rule</Button>
  </Disclosure>;
}
