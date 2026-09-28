"use client";

import { Check, Clipboard, Download, FileText, Loader2, RotateCcw, ScanText, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/controls";
import { Badge, EmptyState, InspectorSection, Notice, Progress } from "@/components/ui/primitives";
import { ContinueWith } from "@/components/workspace/continue-with";
import { FilePreview } from "@/components/workspace/file-preview";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { downloadOcrText } from "@/core/ocr/text-export";
import { messageFor } from "@/core/runtime/messages";
import type { OcrLanguageChoice } from "@/core/runtime/types";

function stageLabel(stage?: string): string {
  if (!stage) return "Preparing local OCR";
  const value = stage.toLowerCase();
  if (value.includes("load") || value.includes("initial")) return "Loading language model";
  if (value.includes("recogn")) return "Reading text";
  if (value.includes("prepar") || value.includes("encod")) return "Preparing screenshot";
  return "Processing locally";
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

export function OcrTool({ landing }: { landing: ReactNode }) {
  const count = useWorkspace((state) => state.order.length);
  return count === 0 ? <>{landing}</> : <OcrWorkspace />;
}

function OcrWorkspace() {
  const { runtime } = useWorkspaceContext();
  const selectedId = useWorkspace((state) => state.selectedId);
  const file = useWorkspace((state) => state.selectedId ? state.files[state.selectedId] : undefined);
  const language = useWorkspace((state) => state.ocr.language);
  const result = useWorkspace((state) => state.selectedId ? state.ocr.byAsset[state.selectedId] : undefined);
  const setLanguage = useWorkspace((state) => state.setOcrLanguage);
  const setEditedText = useWorkspace((state) => state.setOcrEditedText);
  const [copied, setCopied] = useState(false);

  if (!selectedId || !file) return null;

  const busy = result?.status === "running";
  const ready = result?.status === "done" && !!result.resultId;
  const text = result?.editedText ?? "";

  async function extract() {
    try {
      await runtime.extractText(selectedId!, language);
    } catch {
      // The store receives the controlled error code; no third-party detail enters UI state.
    }
  }

  async function copy() {
    if (!text) return;
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const primary = ready ? { label: "Download TXT", onClick: () => downloadOcrText(text, file.name), disabled: !text } : undefined;

  return (
    <WorkspaceShell
      tool="extract-text"
      status={<Badge tone={ready ? "success" : result?.status === "failed" ? "error" : busy ? "accent" : "neutral"} dot>{ready ? "Text ready" : busy ? stageLabel(result?.stage) : result?.status === "failed" ? "Extraction failed" : "Ready to extract"}</Badge>}
      fileHint="OCR reads the currently selected screenshot. Previous Shotexa results stay available here."
      inspectorTitle="OCR controls"
      exportAction={primary}
      canvas={
        <div data-testid="ocr-workspace">
          <h1 className="sr-only">Convert Screenshot to Text</h1>
          {result?.error && result.status !== "cancelled" && (
            <Notice tone="error" icon={<X />} title="Text extraction stopped" actions={<Button variant="secondary" onClick={extract}><RotateCcw /> Try again</Button>}>
              {messageFor(result.error)}
            </Notice>
          )}
          {result?.status === "cancelled" && <Notice className="mb-4" title="Extraction cancelled">Your screenshot is unchanged. Start again whenever you are ready.</Notice>}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-xs">
            <div>
              <p className="font-display text-lg">Screenshot to Text</p>
              <p className="text-sm text-ink-2">OCR runs locally in your browser.</p>
            </div>
            <Button variant="primary" size="lg" onClick={extract} disabled={busy} data-testid="extract-text">
              {busy ? <Loader2 className="animate-spin" /> : ready ? <RotateCcw /> : <ScanText />}
              {busy ? "Extracting…" : ready ? "Extract Again" : "Extract Text"}
            </Button>
          </div>
          {busy && <div className="mb-4 rounded-lg border border-accent-line bg-accent-soft p-4" aria-live="polite"><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-medium text-accent-ink">{stageLabel(result.stage)}</span><span className="t-mono text-accent-ink">{Math.round((result.progress ?? 0) * 100)}%</span></div><Progress value={result.progress} label="OCR progress" /></div>}
          <div className="grid gap-4 xl:grid-cols-2">
            <FilePreview />
            <section className="flex min-h-[32rem] flex-col rounded-lg border border-line bg-surface p-4 shadow-xs" aria-label="Extracted text editor">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div><p className="font-display text-xl">Extracted text</p><p className="text-xs text-ink-3">Review and correct the text before using it.</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={copy} disabled={!text} data-testid="copy-text">{copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy"}</Button>
                  <Button size="sm" variant="secondary" onClick={() => downloadOcrText(text, file.name)} disabled={!text} data-testid="download-txt"><Download /> TXT</Button>
                </div>
              </div>
              {ready || text ? (
                <textarea
                  aria-label="Extracted text"
                  data-testid="ocr-result-text"
                  value={text}
                  onChange={(event) => setEditedText(selectedId, event.target.value)}
                  spellCheck
                  className="min-h-[26rem] flex-1 resize-y rounded-md border border-line bg-surface-3 p-4 font-sans text-[15px] leading-7 text-ink outline-none focus:border-accent"
                />
              ) : (
                <EmptyState className="flex-1" icon={<FileText />} title="Text will appear here">Choose a language and select Extract Text. The result remains editable in this workspace.</EmptyState>
              )}
            </section>
          </div>
        </div>
      }
      inspector={
        <div data-testid="ocr-controls">
          <InspectorSection title="OCR language">
            <SegmentedControl<OcrLanguageChoice>
              label="OCR language"
              value={language}
              onChange={setLanguage}
              options={[{ value: "eng", label: "English" }, { value: "eng+hin", label: "English + Hindi" }]}
            />
            <p className="mt-2 text-xs leading-5 text-ink-3">Hindi loads only when selected. English remains the default.</p>
          </InspectorSection>
          <InspectorSection title="Extraction">
            {busy ? (
              <div className="space-y-3"><Progress value={result.progress} label="Text extraction progress" /><p className="text-sm text-ink-2" aria-live="polite">{stageLabel(result.stage)} · {Math.round((result.progress ?? 0) * 100)}%</p><Button className="w-full" variant="secondary" onClick={() => void runtime.cancelOcr(selectedId)} data-testid="cancel-ocr"><X /> Cancel</Button></div>
            ) : (
              <Button className="w-full" variant="primary" size="lg" onClick={extract} data-testid="extract-text-inspector">{ready ? <RotateCcw /> : <ScanText />}{ready ? "Extract Again" : "Extract Text"}</Button>
            )}
            <p className="mt-3 text-xs leading-5 text-ink-3">Shotexa uses the original screenshot by default and only applies a controlled upscale for very small text.</p>
          </InspectorSection>
          <InspectorSection title="Use the result">
            <div className="grid gap-2"><Button variant="secondary" onClick={copy} disabled={!text}>{copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy text"}</Button><Button variant="secondary" onClick={() => downloadOcrText(text, file.name)} disabled={!text}><Download /> Download TXT</Button></div>
          </InspectorSection>
          <InspectorSection title="Privacy">
            <p className="text-sm leading-6 text-ink-2">The screenshot and extracted text stay in this browser workspace. Language models are loaded from Shotexa’s own site.</p>
          </InspectorSection>
        </div>
      }
      below={ready && <div data-testid="ocr-result"><div className="mt-5 rounded-lg border border-[#cfe5d6] bg-success-soft p-4 text-sm font-medium text-success">Text is ready. Your edits are saved in this browser workspace until refresh.</div><div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface-3 p-4"><p className="font-display text-lg">Searchable PDF</p><p className="mt-1 text-sm text-ink-2">The structured OCR layout is preserved for this future workflow. Searchable PDF is not part of this phase.</p></div><ContinueWith tools={["pdf", "safe-share", "annotate"]} fileId={selectedId} /></div>}
    />
  );
}
