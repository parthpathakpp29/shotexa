"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { TOOLS } from "@/config/tools";
import { downloadAsset } from "@/core/runtime/runtime";
import type { RedactionMode, SafeShareVerification } from "@/core/redaction/types";
import { RedactionCanvas } from "./redaction-canvas";
import { RedactionInspector } from "./redaction-inspector";

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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; verification: SafeShareVerification } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMode(defaultMode), [defaultMode, setMode]);

  async function exportSafeCopy() {
    if (!selectedId || !operations.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const exported = await runtime.exportSafeShare(selectedId);
      setResult({ id: exported.id, verification: exported.verification });
      downloadAsset(runtime, exported.id);
    } catch (e) {
      setError((e as { code?: string }).code === "REDACTION_MEMORY_PRESSURE" ? "This image is too large for a safe export on this device. Try a smaller image or PNG output." : "Safe Share could not export this image. Your original is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  if (!selectedId || !file) return null;
  const verification = result?.verification ?? null;
  return (
    <WorkspaceShell
      tool={tool}
      status={<Badge tone={result ? "success" : operations.length ? "accent" : "neutral"} dot>{result ? "Safe Share Ready" : operations.length ? `${operations.length} region${operations.length === 1 ? "" : "s"} selected` : "Ready to redact"}</Badge>}
      fileHint="Select a screenshot or a previous Shotexa result. Redactions stay editable until export."
      inspectorTitle="Safe Share controls"
      exportAction={{ label: tool === "blur" ? "Export Blurred Copy" : "Export Safe Copy", onClick: exportSafeCopy, disabled: !operations.length, busy }}
      canvas={
        <>
          <h1 className="sr-only">{TOOLS[tool].seo.h1}</h1>
          {error && <div role="alert" className="mb-3 rounded-md border border-error/20 bg-error-soft px-4 py-3 text-sm text-error">{error}</div>}
          <RedactionCanvas assetId={selectedId} />
        </>
      }
      inspector={<RedactionInspector assetId={selectedId} verification={verification} />}
      below={
        result && (
          <div data-testid="safe-share-result">
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-[#cfe5d6] bg-success-soft p-4 text-success">
              <ShieldCheck className="size-5" />
              <p className="text-sm font-medium">Safe copy verified and downloaded. The result is now available to other Shotexa tools.</p>
            </div>
            <ContinueWith tools={TOOLS[tool].continueWith} fileId={result.id} />
          </div>
        )
      }
    />
  );
}
