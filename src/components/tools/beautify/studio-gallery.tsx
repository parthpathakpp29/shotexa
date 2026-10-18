"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check, LayoutGrid, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { drawBeautified } from "@/core/beautify/draw";
import { beautifyLayout } from "@/core/beautify/layout";
import { STYLE_PRESETS } from "@/core/beautify/presets";
import { resolveStudioTemplate, STUDIO_BACKGROUNDS, STUDIO_TEMPLATES } from "@/core/beautify/studio-library";
import type { BeautifySettings } from "@/core/beautify/types";

type CardSize = "compact" | "large";
function PreviewCard({ assetId, settings, label, caption, testId, active, onClick, size = "compact" }: { assetId: string; settings: BeautifySettings; label: string; caption: string; testId: string; active?: boolean; onClick(): void; size?: CardSize }) {
  const { runtime } = useWorkspaceContext();
  const files = useWorkspace((s) => s.files);
  const file = files[assetId];
  const version = file?.previewVersion ?? 0;
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = ref.current;
    if (!visible || !canvas || !file) return;
    const source = { width: file.width, height: file.height };
    const layout = beautifyLayout(settings, source);
    const factor = Math.min(320 / layout.canvas.width, 200 / layout.canvas.height);
    canvas.width = Math.max(1, Math.round(layout.canvas.width * factor));
    canvas.height = Math.max(1, Math.round(layout.canvas.height * factor));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bitmap = runtime.registry.preview(assetId);
    const ids = [...settings.composition.assetIds, settings.branding.assetId, settings.background.assetId].filter((id): id is string => !!id && id !== assetId);
    const resources = [...new Set(ids)].flatMap((id) => {
      const resource = files[id]; const image = runtime.registry.preview(id);
      return resource && image ? [{ id, image, imageScale: image.width / resource.width, source: { width: resource.width, height: resource.height } }] : [];
    });
    drawBeautified(ctx, layout, bitmap ?? null, bitmap ? bitmap.width / file.width : 1, canvas.width / layout.canvas.width, 0, resources);
    return () => { canvas.width = 0; canvas.height = 0; };
  }, [assetId, file, files, runtime, settings, version, visible]);

  return <button type="button" data-testid={testId} aria-label={`${label} design preview, ${caption}`} aria-pressed={active} onClick={onClick}
    className={`group relative overflow-hidden rounded-xl border bg-surface text-left transition duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? "border-accent ring-2 ring-accent/25" : "border-line"} ${size === "large" ? "flex min-h-56 flex-col shadow-sm" : "flex min-h-[98px] w-full items-center gap-3 p-2 shadow-xs"}`}>
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#e9e6df] ${size === "large" ? "h-[170px] w-full rounded-b-none rounded-t-xl p-2" : "h-[76px] w-[96px] p-1"}`}>
      <canvas ref={ref} role="img" aria-label={`${label} composition preview`} className="max-h-full max-w-full rounded-[2px] shadow-md" />
    </span>
    <span className={`min-w-0 flex-1 ${size === "large" ? "block px-3.5 py-3" : "block pr-2"}`}>
      <span className="flex items-start justify-between gap-2"><span className="block truncate text-sm font-semibold text-ink">{label}</span>{active ? <Check aria-hidden className="size-4 shrink-0 text-accent" /> : <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-ink-3 opacity-0 transition group-hover:opacity-100" />}</span>
      <span className="mt-1 block text-xs leading-snug text-ink-3">{caption}</span>
    </span>
  </button>;
}

function CategoryTabs({ categories, category, onChange, label }: { categories: string[]; category: string; onChange(value: string): void; label: string }) {
  return <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={label}>
    {categories.map((item) => <button type="button" key={item} aria-pressed={category === item} onClick={() => onChange(item)} className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-semibold transition ${category === item ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink-2 hover:border-accent"}`}>{item}</button>)}
  </div>;
}

export function StudioTemplates({ assetId, settings, onApply }: { assetId: string; settings: BeautifySettings; onApply(next: Partial<BeautifySettings>): void }) {
  const file = useWorkspace((s) => s.files[assetId]);
  const source = file ? { width: file.width, height: file.height } : undefined;
  const portrait = !!source && source.height / source.width > 1.25;
  const ordered = portrait
    ? [...STUDIO_TEMPLATES].sort((a, b) => (a.id === "frosted-app" ? -1 : b.id === "frosted-app" ? 1 : a.category === "Social" ? -1 : b.category === "Social" ? 1 : 0))
    : STUDIO_TEMPLATES;
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState(false);
  const categories = ["All", ...new Set(STUDIO_TEMPLATES.map((entry) => entry.category))];
  const activeId = STUDIO_TEMPLATES.find((entry) => {
    const design = resolveStudioTemplate(entry, settings, source);
    return design.background?.studioId === settings.background.studioId
      && design.mode === settings.mode
      && design.preset === settings.preset
      && design.padding === settings.padding
      && design.scale === settings.scale
      && design.shadow === settings.shadow
      && design.perspective?.preset === settings.perspective.preset;
  })?.id;
  const applyTemplate = (template: (typeof STUDIO_TEMPLATES)[number]) => { onApply(resolveStudioTemplate(template, settings, source)); setOpen(false); };
  const card = (template: (typeof STUDIO_TEMPLATES)[number], size: CardSize) => {
    const next = { ...settings, ...resolveStudioTemplate(template, settings, source) };
    return <PreviewCard key={template.id} assetId={assetId} settings={next} label={template.label} caption={size === "large" ? template.description : template.use} testId={`beautify-template-${template.id}${size === "large" ? "-gallery" : ""}`} active={activeId === template.id} size={size} onClick={() => applyTemplate(template)} />;
  };
  return <div data-testid="beautify-template-gallery">
    <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2.5"><p className="text-sm font-medium text-ink">Choose a look. Make it yours.</p><p className="mt-0.5 text-xs leading-snug text-ink-3">One click sets the composition; every control stays editable.</p></div>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button type="button" data-testid="beautify-browse-templates" className="mb-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><LayoutGrid className="size-4" /> Browse full-size previews <ArrowUpRight className="size-4" /></button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1c1714]/65 backdrop-blur-sm" />
        <Dialog.Content data-testid="beautify-template-dialog" className="fixed inset-2 z-[71] flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-page shadow-2xl focus:outline-none sm:inset-5 lg:inset-x-[max(2rem,calc((100vw-1320px)/2))] lg:inset-y-8">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4 sm:px-7 sm:py-5">
            <div><Dialog.Title className="font-display text-2xl text-ink sm:text-3xl">Designs for your screenshot</Dialog.Title><Dialog.Description className="mt-1 text-sm text-ink-3">The previews use your own image. Select a design to apply it instantly.</Dialog.Description></div>
            <Dialog.Close aria-label="Close template collection" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"><X className="size-5" /></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <CategoryTabs categories={categories} category={category} onChange={setCategory} label="Template categories" />
            <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{ordered.filter((entry) => category === "All" || entry.category === category).map((entry) => card(entry, "large"))}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <p className="t-micro mb-2 text-ink-3">{portrait ? "Recommended for portrait screenshots" : "Quick picks"}</p>
    <div className="max-h-[25rem] space-y-2 overflow-y-auto pr-1" data-testid="beautify-template-quick-picks">{ordered.map((entry) => card(entry, "compact"))}</div>
  </div>;
}

export function RecipeGallery({ assetId, settings, onApply }: { assetId: string; settings: BeautifySettings; onApply(next: Partial<BeautifySettings>): void }) {
  return <div className="max-h-[26rem] space-y-2 overflow-y-auto rounded-lg pr-1" data-testid="beautify-recipe-gallery">
    {STYLE_PRESETS.map((preset) => <PreviewCard key={preset.id} assetId={assetId} settings={{ ...settings, ...preset.settings, text: settings.text }} label={preset.label} caption="Classic recipe" testId={`beautify-style-${preset.id}`} onClick={() => onApply({ ...preset.settings, text: settings.text })} />)}
  </div>;
}

export function StudioBackgrounds({ assetId, settings, onApply }: { assetId: string; settings: BeautifySettings; onApply(next: Partial<BeautifySettings>): void }) {
  const [category, setCategory] = useState("All");
  const [open, setOpen] = useState(false);
  const categories = ["All", ...new Set(STUDIO_BACKGROUNDS.map((entry) => entry.category))];
  const applyBackground = (entry: (typeof STUDIO_BACKGROUNDS)[number]) => { onApply({ background: entry.background }); setOpen(false); };
  const card = (entry: (typeof STUDIO_BACKGROUNDS)[number], size: CardSize) => <PreviewCard key={entry.id} assetId={assetId} settings={{ ...settings, background: entry.background }} label={entry.label} caption={size === "large" ? entry.description : entry.category} testId={`beautify-premium-bg-${entry.id}${size === "large" ? "-gallery" : ""}`} active={settings.background.kind === "studio" && settings.background.studioId === entry.id} size={size} onClick={() => applyBackground(entry)} />;
  return <div data-testid="beautify-background-gallery">
    <p className="t-body-sm mb-3 text-ink-3">Original artwork, rendered at the full size of your export.</p>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button type="button" data-testid="beautify-browse-backgrounds" className="mb-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 text-sm font-semibold text-accent-ink transition hover:border-accent focus-visible:outline-2 focus-visible:outline-accent"><LayoutGrid className="size-4" /> Explore backgrounds <ArrowUpRight className="size-4" /></button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#1c1714]/65 backdrop-blur-sm" />
        <Dialog.Content data-testid="beautify-background-dialog" className="fixed inset-2 z-[71] flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-page shadow-2xl focus:outline-none sm:inset-5 lg:inset-x-[max(2rem,calc((100vw-1320px)/2))] lg:inset-y-8">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4 sm:px-7 sm:py-5">
            <div><Dialog.Title className="font-display text-2xl text-ink sm:text-3xl">The background library</Dialog.Title><Dialog.Description className="mt-1 text-sm text-ink-3">Eighteen original scenes. Preview each one with your screenshot.</Dialog.Description></div>
            <Dialog.Close aria-label="Close background collection" className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"><X className="size-5" /></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <CategoryTabs categories={categories} category={category} onChange={setCategory} label="Background categories" />
            <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{STUDIO_BACKGROUNDS.filter((entry) => category === "All" || entry.category === category).map((entry) => card(entry, "large"))}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1" data-testid="beautify-background-quick-picks">{STUDIO_BACKGROUNDS.map((entry) => card(entry, "compact"))}</div>
  </div>;
}
