"use client";

import { ArrowDown, ArrowUp, Plus, RotateCcw, Scissors, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure, SegmentedControl, Slider, Toggle } from "@/components/ui/controls";
import { Badge, FieldLabel, InspectorSection } from "@/components/ui/primitives";
import type { PageBreak, PaperSize } from "@/core/pdf/types";
import type { PdfSession } from "@/core/runtime/types";

export interface SelectedPdfBreak {
  assetId: string;
  imageIndex: number;
  breakIndex: number;
  pageNumber: number;
  pageBreak: PageBreak;
  capacityPx: number;
}

export function PdfInspector({
  searchable = false,
  session,
  reviewCount,
  selected,
  busy,
  onSettings,
  onPrevious,
  onNext,
  onNudge,
  onSnap,
  onAdd,
  onDelete,
  onReset,
  onCancel,
}: {
  searchable?: boolean;
  session: PdfSession;
  reviewCount: number;
  selected: SelectedPdfBreak | null;
  busy: boolean;
  onSettings(settings: Partial<Pick<PdfSession, "paper" | "marginPt" | "smart" | "imageFormat" | "jpegQuality">>): void;
  onPrevious(): void;
  onNext(): void;
  onNudge(delta: number): void;
  onSnap(): void;
  onAdd(): void;
  onDelete(): void;
  onReset(): void;
  onCancel(): void;
}) {
  const shift = selected?.pageBreak.idealY === undefined ? null : selected.pageBreak.y - selected.pageBreak.idealY;
  return (
    <div data-testid="pdf-controls">
      <InspectorSection title="Page setup">
        <FieldLabel>PAGE SIZE</FieldLabel>
        <SegmentedControl<PaperSize>
          label="PDF page size"
          value={session.paper}
          onChange={(paper) => onSettings({ paper })}
          options={[{ value: "a4", label: "A4" }, { value: "letter", label: "Letter" }, { value: "fit", label: "Fit" }]}
        />
        <div className="mt-4">
          <FieldLabel value={`${session.marginPt} pt`}>MARGINS</FieldLabel>
          <Slider label="PDF margins" min={0} max={72} step={2} value={session.marginPt} valueText={`${session.marginPt} points`} onChange={(marginPt) => onSettings({ marginPt })} />
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-3">Fit keeps each screenshot on one custom-size page. A4 and Letter split long screenshots across pages.</p>
      </InspectorSection>

      <InspectorSection title="Pagination">
        <Toggle checked={session.smart} onChange={(smart) => onSettings({ smart })} label="Smart Pagination" description={session.smart ? "On · looks for cleaner breaks" : "Off · fixed page cuts"} />
        {session.smart && session.paper !== "fit" && (
          <div className="mt-3 rounded-md border border-line bg-surface-3 p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Break review</span><Badge tone={reviewCount ? "warning" : "success"} dot>{reviewCount ? `${reviewCount} to review` : "High confidence"}</Badge></div>
            <p className="mt-2 text-xs leading-5 text-ink-3">Amber breaks may split a message, photo or dense block. Review and move them when needed.</p>
            <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="secondary" size="sm" onClick={onPrevious} disabled={!session.plan?.images.some((image) => image.breaks.length)}><ArrowUp /> Previous</Button><Button variant="secondary" size="sm" onClick={onNext} disabled={!session.plan?.images.some((image) => image.breaks.length)}><ArrowDown /> Next</Button></div>
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="Page breaks" action={<button type="button" onClick={onReset} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink max-md:min-h-11"><RotateCcw className="size-3.5" /> Reset</button>}>
        {selected ? (
          <div className="space-y-3" data-testid="selected-pdf-break">
            <div className="rounded-md border border-line bg-surface-3 p-3">
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">Break before page {selected.pageNumber + 1}</span><Badge tone={selected.pageBreak.source === "manual" ? "accent" : selected.pageBreak.confidence === "high" ? "success" : "warning"}>{selected.pageBreak.source === "manual" ? "Adjusted" : selected.pageBreak.confidence === "high" ? "High confidence" : "Review recommended"}</Badge></div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"><dt className="text-ink-3">Position</dt><dd className="t-mono text-right">{selected.pageBreak.y} px</dd><dt className="text-ink-3">Automatic shift</dt><dd className="t-mono text-right">{shift === null ? "—" : `${shift > 0 ? "+" : ""}${shift} px`}</dd></dl>
            </div>
            <div className="grid grid-cols-2 gap-2"><Button variant="secondary" size="sm" onClick={() => onNudge(-10)}><ArrowUp /> 10 px</Button><Button variant="secondary" size="sm" onClick={() => onNudge(10)}><ArrowDown /> 10 px</Button></div>
            <Button className="w-full" variant="secondary" size="sm" onClick={onSnap}><Scissors /> Snap to nearby gap</Button>
            <Button className="w-full" variant="ghost" size="sm" onClick={onDelete}><Trash2 /> Delete this break</Button>
          </div>
        ) : <p className="text-sm leading-6 text-ink-2">Select a page-break line in the preview. Arrow keys move it by 4 px; Shift + Arrow moves it by 40 px.</p>}
        <Button className="mt-3 w-full" variant="secondary" onClick={onAdd} disabled={!session.plan || session.paper === "fit"}><Plus /> Add page break</Button>
      </InspectorSection>

      <InspectorSection title="Output">
        <Disclosure title="OUTPUT OPTIONS">
          <FieldLabel>PAGE IMAGE</FieldLabel>
          <SegmentedControl<"jpeg" | "png"> label="PDF page image format" value={session.imageFormat} onChange={(imageFormat) => onSettings({ imageFormat })} options={[{ value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }]} />
          {session.imageFormat === "jpeg" && <div className="mt-4"><FieldLabel value={`${Math.round(session.jpegQuality * 100)}%`}>QUALITY</FieldLabel><Slider label="JPEG quality" min={0.7} max={1} step={0.02} value={session.jpegQuality} onChange={(jpegQuality) => onSettings({ jpegQuality })} /></div>}
          <p className="mt-3 text-xs leading-5 text-ink-3">JPEG is the fast default. PNG is lossless for flat screenshots but can take several times longer to build.</p>
        </Disclosure>
        {busy && <Button className="mt-3 w-full" variant="secondary" onClick={onCancel} data-testid="cancel-pdf"><X /> Cancel</Button>}
        <p className="mt-4 text-xs leading-5 text-ink-3">{searchable ? "PDF creation and the searchable text layer stay local in this browser." : "PDF creation runs locally. Normal PDF and Smart Pagination do not load OCR."}</p>
      </InspectorSection>
    </div>
  );
}
