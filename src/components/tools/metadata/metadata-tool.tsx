"use client";

import { CheckCircle2, Download, Eraser, Loader2, MapPin, Palette, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { VerificationCard } from "@/components/ui/controls";
import { Badge, InspectorSection, Mono } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { FilePreview } from "@/components/workspace/file-preview";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import type { MetadataInspection, MetadataVerification } from "@/core/metadata/types";
import { downloadAsset } from "@/core/runtime/runtime";

export function MetadataTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((s) => s.order.length);
  return count === 0 ? <>{landing}</> : <MetadataWorkspace />;
}

function MetadataWorkspace() {
  const selectedId = useWorkspace((s) => s.selectedId);
  const file = useWorkspace((s) => (s.selectedId ? s.files[s.selectedId] : undefined));
  const [result, setResult] = useState<{ id: string; verification: MetadataVerification; changed: boolean } | null>(null);
  if (!selectedId || !file) return null;
  return <MetadataAssetWorkspace key={selectedId} selectedId={selectedId} result={result} setResult={setResult} />;
}

function MetadataAssetWorkspace({
  selectedId,
  result,
  setResult,
}: {
  selectedId: string;
  result: { id: string; verification: MetadataVerification; changed: boolean } | null;
  setResult: (result: { id: string; verification: MetadataVerification; changed: boolean } | null) => void;
}) {
  const { runtime } = useWorkspaceContext();
  const [inspection, setInspection] = useState<MetadataInspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void runtime.inspectMetadata(selectedId).then((r) => active && setInspection(r.inspection)).catch(() => active && setError("This file could not be inspected safely.")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [runtime, selectedId]);

  async function clean() {
    if (!selectedId || cleaning) return;
    setCleaning(true);
    setError(null);
    try {
      const r = await runtime.cleanMetadata(selectedId);
      const id = r.artifactId ?? selectedId;
      setResult({ id, verification: r.verification, changed: r.changed });
      if (r.artifactId) downloadAsset(runtime, r.artifactId);
    } catch {
      setError("Privacy Clean could not verify a safe output. Your original file is unchanged.");
    } finally {
      setCleaning(false);
    }
  }

  const hasPrivacy = inspection?.hasPrivacyMetadata ?? false;
  const action = result
    ? { label: result.changed ? "Download Clean Image" : "Download Original", onClick: () => downloadAsset(runtime, result.id) }
    : hasPrivacy
      ? { label: "Privacy Clean", onClick: clean, busy: cleaning }
      : inspection
        ? { label: "Download Original", onClick: () => downloadAsset(runtime, selectedId) }
        : { label: "Inspecting…", onClick: () => undefined, disabled: true, busy: loading };

  return (
    <WorkspaceShell
      tool="metadata"
      status={<Badge tone={result?.verification.passed ? "success" : hasPrivacy ? "warning" : "neutral"} dot>{result?.verification.passed ? "Verified clean" : loading ? "Inspecting locally" : hasPrivacy ? "Privacy metadata found" : "No privacy metadata found"}</Badge>}
      inspectorTitle="Privacy Clean"
      fileHint="Select any JPEG, PNG or WebP file to inspect its metadata locally."
      exportAction={action}
      canvas={<><h1 className="sr-only">Remove Metadata From Images</h1>{error && <div role="alert" className="mb-3 rounded-md border border-error/20 bg-error-soft px-4 py-3 text-sm text-error">{error}</div>}<FilePreview /></>}
      inspector={
        <div data-testid="metadata-tool">
          <InspectorSection title="Local inspection">
            {loading ? <div className="flex items-center gap-2 text-sm text-ink-2"><Loader2 className="size-4 animate-spin text-accent" /> Reading container metadata…</div> : inspection && <div className="space-y-3"><div className="flex justify-between"><span className="text-sm text-ink-2">Format</span><Mono className="uppercase">{inspection.format}</Mono></div><div className="flex justify-between"><span className="text-sm text-ink-2">Dimensions</span><Mono>{inspection.width} × {inspection.height}</Mono></div><div className="flex justify-between"><span className="text-sm text-ink-2">File size</span><Mono>{Math.max(1, Math.round(inspection.bytes / 1024))} KB</Mono></div></div>}
          </InspectorSection>
          <InspectorSection title="Privacy information to remove">
            {inspection?.privacyFindings.length ? (
              <div data-testid="privacy-findings">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {[...new Set(inspection.privacyFindings.map((finding) => finding.category))].map((category) => <Badge key={category} tone="warning" mono={false}>{category === "location" ? "GPS location" : category === "device" || category === "camera" ? "EXIF device information" : category === "comment" || category === "description" ? "Author / comments" : category.toUpperCase()}</Badge>)}
                </div>
                <ul className="space-y-2">
                  {inspection.privacyFindings.slice(0, 8).map((finding, i) => <li key={`${finding.source}-${finding.label}-${i}`} className="rounded-md border border-[#f0dcb4] bg-warning-soft px-3 py-2"><p className="flex items-center gap-2 text-sm font-medium text-ink">{finding.category === "location" ? <MapPin className="size-3.5 text-warning" /> : <Eraser className="size-3.5 text-warning" />}{finding.label}</p><p className="t-mono mt-0.5 truncate text-[10px] text-ink-3">{finding.source}{finding.value ? ` · ${finding.value}` : ""}</p></li>)}
                </ul>
              </div>
            ) : inspection ? <div className="flex items-start gap-2 rounded-md border border-[#cfe5d6] bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /><span>No privacy-sensitive metadata found.</span></div> : null}
          </InspectorSection>
          <InspectorSection title="Preserved for correct rendering">
            {inspection?.preservedMetadata.length ? <ul className="space-y-2">{[...new Map(inspection.preservedMetadata.map((item) => [item.label, item])).values()].slice(0, 8).map((item) => <li key={item.label} className="flex items-start gap-2 text-sm text-ink-2"><Palette className="mt-0.5 size-4 shrink-0 text-accent" /><span><strong className="font-medium text-ink">{item.label}</strong><span className="block text-xs">{item.reason}</span></span></li>)}</ul> : <p className="t-body-sm text-ink-2">Required image structure, dimensions, alpha and pixel data remain intact.</p>}
          </InspectorSection>
          {result && <InspectorSection title="Verification"><VerificationCard title={result.changed ? "Privacy Clean complete" : "Already clean"} items={[{ label: result.changed ? "Targeted privacy metadata removed" : "No rewrite was needed", ok: true }, { label: "Dimensions unchanged", ok: result.verification.dimensionsMatch }, { label: "Output parsed and verified", ok: result.verification.outputValid && result.verification.passed }]} /><Button className="mt-3 w-full" variant="primary" onClick={() => downloadAsset(runtime, result.id)}><Download /> {result.changed ? "Download Clean Image" : "Download Original"}</Button></InspectorSection>}
          {!result && hasPrivacy && <Button variant="primary" size="lg" className="mt-4 w-full" disabled={cleaning} onClick={clean}>{cleaning ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Privacy Clean</Button>}
        </div>
      }
      below={result && <div data-testid="metadata-result"><ContinueWith tools={["safe-share", "pdf"]} fileId={result.id} /></div>}
    />
  );
}
