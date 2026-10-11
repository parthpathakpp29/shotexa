import { createZip, type ArchiveEntry } from "@/core/archive/zip";
import { DEFAULT_BEAUTIFY, STYLE_PRESETS } from "@/core/beautify/presets";
import type { BeautifySettings } from "@/core/beautify/types";
import type { OutputFormat } from "@/core/image-encode/formats";
import { IDENTITY_TRANSFORM, withOutputHeight, withOutputWidth } from "@/core/image-transform/transform";
import type { WorkspaceRuntime } from "@/core/runtime/runtime";
import type { WorkspaceFile } from "@/core/runtime/types";
import { DEFAULT_BACKGROUND_REMOVAL } from "@/core/background-removal/types";
import { applyComparePreset, COMPARE_REPORT_NAMES, DEFAULT_COMPARE } from "@/core/compare/presets";
import { privacyConfigForPreset } from "@/core/privacy/presets";
import { detectSensitiveText } from "@/core/privacy/detectors";
import { entriesToJson, exportTextBlob, extractionToMarkdown, tableToDelimited, tableToJson } from "@/core/structured-data/export";
import { formatBytes } from "@/lib/format-bytes";
import { workflowOutputsFor, type WorkflowOutputRegistry } from "./output-registry";
import type { WorkflowAdapterMap, WorkflowExecutionContext, WorkflowStepDefinition } from "./types";

const cancelled = () => Object.assign(new Error("Workflow cancelled"), { code: "WORKFLOW_CANCELLED" });
const check = (context: WorkflowExecutionContext) => { if (context.signal.aborted) throw cancelled(); };

function currentFile(runtime: WorkspaceRuntime, context: WorkflowExecutionContext): WorkspaceFile {
  const id = context.assetIds[0];
  const file = id ? runtime.store.getState().files[id] : undefined;
  if (!file) throw Object.assign(new Error("Workflow input is missing"), { code: "WORKFLOW_INPUT_MISSING" });
  return file;
}

function mergedBeautify(base: BeautifySettings, patch: Partial<BeautifySettings>): BeautifySettings {
  return {
    ...base,
    ...patch,
    background: { ...base.background, ...patch.background },
    shadowAdvanced: { ...base.shadowAdvanced, ...patch.shadowAdvanced },
    border: { ...base.border, ...patch.border },
    text: { ...base.text, ...patch.text },
    browser: { ...base.browser, ...patch.browser },
    phone: { ...base.phone, ...patch.phone },
    perspective: { ...base.perspective, ...patch.perspective },
    composition: { ...base.composition, ...patch.composition },
    branding: { ...base.branding, ...patch.branding },
    animation: { ...base.animation, ...patch.animation },
  };
}

function formatExtension(format: OutputFormat): string { return format === "jpeg" ? "jpg" : format; }

function textBlob(value: string, type = "text/plain;charset=utf-8"): Blob { return new Blob([value], { type }); }

function reportMarkdown(title: string, notes: string, file: WorkspaceFile, text: string, generatedAt: string): string {
  return [
    `# ${title || "Bug report"}`,
    "",
    "## Screenshot",
    "",
    "See `screenshot.png` in this package.",
    "",
    "## Extracted visible text",
    "",
    text.trim() || "No OCR text was included.",
    "",
    "## Image details",
    "",
    `- Dimensions: ${file.width} × ${file.height} px`,
    `- File size: ${file.bytes} bytes`,
    `- Generated: ${generatedAt}`,
    "",
    "These details describe the packaged image; they do not prove what occurred.",
    "",
    "## Notes",
    "",
    notes.trim() || "No notes were added.",
    "",
  ].join("\n");
}

function documentationMarkdown(files: WorkspaceFile[], captions: Record<string, string>, ocrByAsset: Record<string, string>): string {
  const sections = files.map((file, index) => {
    const caption = captions[file.id]?.trim();
    const text = ocrByAsset[file.id]?.trim();
    return [
      `## ${caption || `Screenshot ${index + 1}`}`,
      "",
      `![${caption || file.name}](images/${String(index + 1).padStart(2, "0")}-${file.name})`,
      "",
      text ? "### Extracted visible text" : "",
      text || "",
      "",
    ].filter((line, lineIndex, all) => line || all[lineIndex - 1]).join("\n");
  });
  return ["# Documentation pack", "", "Captions are user-provided. OCR text is reproduced as extracted and is not treated as a description.", "", ...sections].join("\n");
}

export function createWorkflowAdapters(runtime: WorkspaceRuntime, outputs: WorkflowOutputRegistry = workflowOutputsFor(runtime)): WorkflowAdapterMap {
  const input = {
    async execute(_step: WorkflowStepDefinition, context: WorkflowExecutionContext) {
      check(context);
      return { assetIds: context.assetIds };
    },
  };

  const ocr = {
    async execute(step: WorkflowStepDefinition, context: WorkflowExecutionContext) {
      if (step.action !== "ocr") return {};
      const ids = step.config.allInputs ? context.assetIds : context.assetIds.slice(0, 1);
      const textByAsset: Record<string, string> = {};
      for (let index = 0; index < ids.length; index++) {
        check(context);
        const result = await runtime.extractText(ids[index], step.config.language);
        textByAsset[ids[index]] = result.result.editedText;
        context.reportProgress((index + 1) / ids.length);
      }
      return { data: { ocrTextByAsset: JSON.stringify(textByAsset), ocrText: Object.values(textByAsset).join("\n\n") }, checks: ["Visible text extracted locally"] };
    },
    cancel: () => runtime.cancelOcr(),
  };

  const pdf = {
    async execute(step: WorkflowStepDefinition, context: WorkflowExecutionContext) {
      if (step.action !== "pdf") return {};
      check(context);
      context.reportProgress(0.1);
      const setup = { paper: step.config.paper ?? "a4", orientation: "portrait" as const, marginPt: 36, overlapPx: 0 };
      const plan = await runtime.planPdf(context.assetIds, setup, step.config.smart ?? true);
      check(context);
      context.reportProgress(0.5);
      const result = step.config.searchable ? await runtime.exportSearchablePdf(context.assetIds, plan) : await runtime.exportPdf(context.assetIds, plan);
      const output = outputs.put(result.blob, "documentation.pdf");
      context.reportProgress(1);
      return { outputIds: [output.id], data: { pdfOutputId: output.id }, checks: ["PDF generated"] };
    },
    cancel: () => runtime.cancelPdf(),
  };

  return {
    input,
    "privacy-scan": {
      async execute(step, context) {
        if (step.action !== "privacy-scan") return {};
        const file = currentFile(runtime, context);
        const config = privacyConfigForPreset(step.config.preset ?? "maximum");
        config.includeLowConfidence = step.config.includeLowConfidence ?? true;
        config.detectBarcodes = step.config.detectBarcodes ?? config.detectBarcodes;
        const result = await runtime.scanPrivacy(file.id, config);
        context.reportProgress(1);
        return { data: { privacyScanId: result.id, privacyFindingCount: String(result.findings.length) }, checks: ["Privacy scan completed on this device"] };
      },
      cancel: () => runtime.cancelPrivacyScan(),
    },
    "privacy-review": input,
    "redact-review": input,
    "annotation-review": input,
    "remove-background": {
      async execute(step, context) {
        if (step.action !== "remove-background") return {};
        const file = currentFile(runtime, context);
        await runtime.removeBackground(file.id, () => context.reportProgress(0.35), true);
        check(context);
        runtime.store.getState().setExportSettings({ format: "png", quality: 1 });
        const result = await runtime.exportRemovedBackground(file.id, {
          ...DEFAULT_BACKGROUND_REMOVAL,
          edge: { ...DEFAULT_BACKGROUND_REMOVAL.edge },
          background: { kind: "transparent" },
          subject: { ...DEFAULT_BACKGROUND_REMOVAL.subject, padding: step.config.padding ?? 0 },
          trim: step.config.trim ?? false,
        });
        context.reportProgress(1);
        return { assetIds: [result.id], checks: ["Background removed on this device"] };
      },
      cancel: () => runtime.cancelBackgroundRemoval(),
    },
    resize: {
      async execute(step, context) {
        if (step.action !== "resize") return {};
        check(context);
        const file = currentFile(runtime, context);
        let transform = runtime.store.getState().editor.byAsset[file.id] ?? IDENTITY_TRANSFORM;
        if (step.config.width) transform = withOutputWidth(transform, file, step.config.width);
        if (step.config.height && !step.config.width) transform = withOutputHeight(transform, file, step.config.height);
        runtime.store.getState().setEditTransform(file.id, transform);
        const result = await runtime.exportEdit(file.id);
        context.reportProgress(1);
        return { assetIds: [result.id], checks: [`Resized to ${result.width} × ${result.height} px`] };
      },
    },
    beautify: {
      async execute(step, context) {
        if (step.action !== "beautify") return {};
        check(context);
        const file = currentFile(runtime, context);
        const selected = STYLE_PRESETS.find((preset) => preset.id === step.config.preset);
        const current = runtime.store.getState().beautify.byAsset[file.id] ?? DEFAULT_BEAUTIFY;
        const next = mergedBeautify(current, selected?.settings ?? {});
        next.preset = step.config.canvas ?? next.preset;
        next.composition = { ...next.composition, assetIds: context.assetIds.slice(1, 3) };
        runtime.store.getState().setBeautify(file.id, next);
        runtime.store.getState().setExportSettings({ format: step.config.format ?? "webp", quality: step.config.quality ?? 0.86 });
        const result = await runtime.exportBeautified(file.id);
        context.reportProgress(1);
        return { assetIds: [result.id], checks: ["Styled image rendered"] };
      },
    },
    watermark: {
      async execute(step, context) {
        if (step.action !== "watermark" || !step.config.assetId) return { assetIds: context.assetIds };
        check(context);
        const file = currentFile(runtime, context);
        const current = runtime.store.getState().beautify.byAsset[file.id] ?? DEFAULT_BEAUTIFY;
        runtime.store.getState().setBeautify(file.id, mergedBeautify(current, {
          branding: {
            ...current.branding,
            assetId: step.config.assetId,
            position: step.config.position ?? "bottom-right",
            opacity: step.config.opacity ?? 82,
            scale: step.config.scale ?? 18,
          },
        }));
        const result = await runtime.exportBeautified(file.id);
        return { assetIds: [result.id], checks: ["Watermark rendered"] };
      },
    },
    "privacy-clean": {
      async execute(step, context) {
        if (step.action !== "privacy-clean") return {};
        const file = currentFile(runtime, context);
        const redactions = runtime.store.getState().redaction.byAsset[file.id] ?? [];
        if (step.config.requireRedactions && !redactions.length) throw Object.assign(new Error("Add at least one reviewed redaction."), { code: "WORKFLOW_REDACTIONS_REQUIRED" });
        if (!redactions.length) {
          const cleaned = await runtime.cleanMetadata(file.id);
          return { assetIds: [cleaned.artifactId ?? file.id], checks: ["Metadata removed"] };
        }
        const result = await runtime.exportSafeShare(file.id);
        context.reportProgress(1);
        const checks = ["Redactions flattened", "Metadata removed", "Flattened output verified"];
        const applied = JSON.parse(context.data.privacyAppliedSubtypes ?? "[]") as string[];
        if (applied.length) {
          try {
            const verified = await runtime.extractText(result.id, undefined, true);
            const residual = detectSensitiveText(verified.result, privacyConfigForPreset("maximum")).filter((finding) => finding.confidence !== "low" && applied.includes(finding.subtype));
            checks.push(residual.length ? "Warning: Sensitive text may still be visible; review before sharing" : "Selected sensitive text was not detected in the flattened copy");
          } catch { checks.push("Warning: Optional post-export text verification could not run; review before sharing"); }
        }
        return { assetIds: [result.id], checks };
      },
    },
    "metadata-remove": {
      async execute(_step, context) {
        const file = currentFile(runtime, context);
        const result = await runtime.cleanMetadata(file.id);
        context.reportProgress(1);
        return { assetIds: [result.artifactId ?? file.id], checks: [result.artifactId ? "Image metadata removed" : "Checked for image metadata: none to remove"] };
      },
    },
    compress: {
      async execute(step, context) {
        if (step.action !== "compress") return {};
        const file = currentFile(runtime, context);
        runtime.store.getState().setEncodeSettings("compress", {
          format: step.config.format ?? "same",
          quality: step.config.quality ?? 0.82,
          targetBytes: step.config.targetBytes ?? null,
        });
        const result = await runtime.encodeAsset("compress", file.id);
        check(context);
        const id = runtime.saveEncoded(result);
        context.reportProgress(1);
        return { assetIds: [id], checks: [`File optimised to ${formatBytes(result.bytes)}`] };
      },
    },
    convert: {
      async execute(step, context) {
        if (step.action !== "convert") return {};
        const file = currentFile(runtime, context);
        runtime.store.getState().setEncodeSettings("convert", { format: step.config.format, quality: step.config.quality ?? 0.9, background: step.config.background ?? "#ffffff" });
        const result = await runtime.encodeAsset("convert", file.id);
        check(context);
        const id = runtime.saveEncoded(result);
        return { assetIds: [id], checks: [`Converted to ${step.config.format.toUpperCase()}`] };
      },
    },
    ocr,
    /**
     * Compare two inputs. This only drives the existing Compare Pro engine through the
     * runtime — alignment, the difference measurement and the region analysis all stay in
     * one place, so a workflow can never disagree with the Compare tool.
     */
    compare: {
      async execute(step, context) {
        if (step.action !== "compare") return {};
        check(context);
        const [a, b] = context.assetIds;
        if (!a || !b) throw Object.assign(new Error("Compare needs two screenshots."), { code: "WORKFLOW_INPUT_MISSING" });
        const base = { ...DEFAULT_COMPARE, ...runtime.store.getState().compare, a, b };
        const configured = step.config.preset ? applyComparePreset(base, step.config.preset) : base;
        runtime.store.getState().setCompare(
          {
            ...configured,
            mode: step.config.mode ?? configured.mode,
            alignment: { ...configured.alignment, mode: step.config.alignment ?? configured.alignment.mode },
          },
          { record: false },
        );
        context.reportProgress(0.2);
        const alignment = await runtime.alignCompare(true);
        check(context);
        context.reportProgress(0.6);
        const analysis = await runtime.measureCompare();
        context.reportProgress(1);
        const checks = [
          alignment.status === "aligned"
            ? `Aligned automatically (X ${Math.round(alignment.dx)} px, Y ${Math.round(alignment.dy)} px, scale ${(alignment.scale * 100).toFixed(1)}%)`
            : alignment.status === "identity"
            ? "Screenshots were already aligned"
            : alignment.status === "failed"
            ? "Alignment could not be measured; compared unaligned"
            : "Alignment off",
          analysis ? `${analysis.changedPercent.toFixed(1)}% of compared pixels changed in ${analysis.regions.length} region(s)` : "Comparison measured",
        ];
        return {
          data: {
            comparePairA: a,
            comparePairB: b,
            compareChangedPercent: analysis ? analysis.changedPercent.toFixed(2) : "",
            compareRegions: String(analysis?.regions.length ?? 0),
          },
          checks,
        };
      },
    },
    "compare-text-diff": {
      async execute(step, context) {
        if (step.action !== "compare-text-diff") return {};
        check(context);
        const diff = await runtime.analyseCompareText();
        context.reportProgress(1);
        return {
          data: { compareTextChanges: String(diff.changes.length) },
          checks: [`Visible text compared locally: ${diff.added} added, ${diff.removed} removed, ${diff.changed} modified`],
        };
      },
      cancel: () => runtime.cancelCompareText(),
    },
    "compare-report": {
      async execute(step, context) {
        if (step.action !== "compare-report") return {};
        check(context);
        const format = step.config.format ?? "pdf";
        const report = await runtime.exportCompareReport(format, { download: false });
        const output = outputs.put(report.blob, COMPARE_REPORT_NAMES[format]);
        context.reportProgress(1);
        return { outputIds: [output.id], data: { compareReportOutputId: output.id }, checks: ["Shotexa Visual Comparison Report generated"] };
      },
    },
    "structured-extract": {
      async execute(step, context) {
        if (step.action !== "structured-extract") return {};
        const file = currentFile(runtime, context);
        const result = await runtime.extractStructuredData(file.id, { mode: step.config.mode ?? "auto" });
        context.reportProgress(1);
        return { data: { structuredAssetId: file.id, structuredType: result.detected }, checks: [`Structured data detected as ${result.detected}`] };
      },
      cancel: () => runtime.cancelStructuredData(),
    },
    "export-csv": {
      async execute(step, context) {
        if (step.action !== "export-csv") return {};
        const result = runtime.structuredResults.forAsset(context.data.structuredAssetId ?? currentFile(runtime, context).id);
        const table = result?.tables[0];
        if (!table) throw Object.assign(new Error("Review structured extraction before CSV export."), { code: "WORKFLOW_STRUCTURED_RESULT_MISSING" });
        const output = outputs.put(exportTextBlob(tableToDelimited(table, step.config.delimiter ?? ","), "text/csv;charset=utf-8"), step.config.filename ?? "extracted-data.csv");
        return { outputIds: [output.id], checks: ["CSV generated"] };
      },
    },
    "export-json": {
      async execute(step, context) {
        if (step.action !== "export-json") return {};
        const result = runtime.structuredResults.forAsset(context.data.structuredAssetId ?? currentFile(runtime, context).id);
        if (!result) throw Object.assign(new Error("Review structured extraction before JSON export."), { code: "WORKFLOW_STRUCTURED_RESULT_MISSING" });
        const value = result.detected === "key-value" ? entriesToJson(result.entries, step.config.inferTypes) : result.tables[0] ? tableToJson(result.tables[0], step.config.inferTypes) : JSON.stringify({ text: result.plainText }, null, 2);
        const output = outputs.put(exportTextBlob(value, "application/json;charset=utf-8"), step.config.filename ?? "extracted-data.json");
        return { outputIds: [output.id], checks: ["JSON generated"] };
      },
    },
    "export-markdown": {
      async execute(step, context) {
        if (step.action !== "export-markdown") return {};
        const result = runtime.structuredResults.forAsset(context.data.structuredAssetId ?? currentFile(runtime, context).id);
        if (!result) throw Object.assign(new Error("Review structured extraction before Markdown export."), { code: "WORKFLOW_STRUCTURED_RESULT_MISSING" });
        const output = outputs.put(exportTextBlob(extractionToMarkdown(result), "text/markdown;charset=utf-8"), step.config.filename ?? "extracted-data.md");
        return { outputIds: [output.id], checks: ["Markdown generated"] };
      },
    },
    "export-xlsx": {
      async execute(step, context) {
        if (step.action !== "export-xlsx") return {};
        const result = runtime.structuredResults.forAsset(context.data.structuredAssetId ?? currentFile(runtime, context).id);
        if (!result?.tables.length) throw Object.assign(new Error("Review a table before XLSX export."), { code: "WORKFLOW_STRUCTURED_RESULT_MISSING" });
        const { createXlsx } = await import("@/core/structured-data/xlsx");
        const output = outputs.put(await createXlsx(step.config.allTables === false ? result.tables.slice(0, 1) : result.tables), step.config.filename ?? "extracted-data.xlsx");
        return { outputIds: [output.id], checks: ["XLSX generated"] };
      },
    },
    pdf,
    "package-bug-report": {
      async execute(step, context) {
        if (step.action !== "package-bug-report") return {};
        check(context);
        const source = currentFile(runtime, context);
        let screenshotId = source.id;
        const annotations = runtime.store.getState().annotation.byAsset[source.id] ?? [];
        const redactions = runtime.store.getState().redaction.byAsset[source.id] ?? [];
        if (annotations.length) screenshotId = (await runtime.exportAnnotated(source.id)).id;
        if (redactions.length) {
          if (screenshotId !== source.id) {
            for (const redaction of redactions) {
              const id = runtime.store.getState().addRedaction(screenshotId, redaction.rect, redaction.mode);
              runtime.store.getState().updateRedaction(screenshotId, id, { intensity: redaction.intensity });
            }
          }
          screenshotId = (await runtime.exportSafeShare(screenshotId)).id;
        }
        const screenshot = runtime.store.getState().files[screenshotId]!;
        const screenshotBlob = runtime.registry.blob(screenshotId)!;
        const generatedAt = new Date().toISOString();
        const text = context.data.ocrText ?? "";
        const notes = context.data.notes ?? step.config.notes ?? "";
        const title = context.data.title ?? step.config.title ?? "Bug report";
        const metadata = {
          generatedAt,
          image: { name: screenshot.name, width: screenshot.width, height: screenshot.height, bytes: screenshot.bytes, type: screenshot.type },
          source: "Shotexa local workflow",
          claim: "Image details describe the packaged file and do not prove what occurred.",
        };
        const zip = await createZip([
          { name: "screenshot.png", input: screenshotBlob },
          { name: "report.md", input: textBlob(reportMarkdown(title, notes, screenshot, text, generatedAt), "text/markdown;charset=utf-8") },
          { name: "extracted-text.txt", input: textBlob(text) },
          { name: "metadata.json", input: textBlob(JSON.stringify(metadata, null, 2), "application/json") },
        ]);
        const output = outputs.put(zip.blob, "bug-report.zip");
        return { assetIds: [screenshotId], outputIds: [output.id], checks: ["Bug report package generated"] };
      },
    },
    "package-documentation": {
      async execute(step, context) {
        if (step.action !== "package-documentation") return {};
        const files = context.assetIds.map((id) => runtime.store.getState().files[id]).filter((file): file is WorkspaceFile => !!file);
        const captions = JSON.parse(context.data.captions ?? JSON.stringify(step.config.captions ?? {})) as Record<string, string>;
        const ocrByAsset = JSON.parse(context.data.ocrTextByAsset ?? "{}") as Record<string, string>;
        const entries: ArchiveEntry[] = [];
        const pdfOutputId = context.data.pdfOutputId;
        const pdfBlob = pdfOutputId ? outputs.blob(pdfOutputId) : undefined;
        if (pdfBlob) entries.push({ name: "documentation.pdf", input: pdfBlob });
        if (step.config.includeMarkdown !== false) entries.push({ name: "documentation.md", input: textBlob(documentationMarkdown(files, captions, ocrByAsset), "text/markdown;charset=utf-8") });
        if (step.config.includeImages !== false) files.forEach((file, index) => entries.push({ name: `images/${String(index + 1).padStart(2, "0")}-${file.name}`, input: runtime.registry.blob(file.id)! }));
        const zip = await createZip(entries);
        const output = outputs.put(zip.blob, "documentation-pack.zip");
        return { outputIds: [output.id], checks: ["Documentation package generated"] };
      },
    },
    export: {
      async execute(step, context) {
        if (step.action !== "export") return {};
        const file = currentFile(runtime, context);
        const blob = runtime.registry.blob(file.id);
        if (!blob) throw Object.assign(new Error("Workflow output is missing"), { code: "WORKFLOW_OUTPUT_MISSING" });
        const format = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpeg" : "webp";
        const requested = step.config.filename ?? `${file.name.replace(/\.[^.]+$/, "")}.${formatExtension(format)}`;
        const name = `${requested.replace(/\.[^.]+$/, "")}.${formatExtension(format)}`;
        const output = outputs.put(blob, name);
        return { outputIds: [output.id], checks: ["Export generated"] };
      },
    },
  };
}
