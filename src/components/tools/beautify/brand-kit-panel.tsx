"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useWorkspace, useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { captureBrandSettings, deleteBrandKit, listBrandKits, materializeBrandKit, saveBrandKit, type BrandKit } from "@/core/brand-kit/storage";
import type { BeautifySettings } from "@/core/beautify/types";

const input = "h-11 w-full rounded-sm border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-accent";

export function BrandKitPanel({ assetId, settings }: { assetId: string; settings: BeautifySettings }) {
  const { runtime } = useWorkspaceContext();
  const files = useWorkspace((s) => s.files);
  const setBeautify = useWorkspace((s) => s.setBeautify);
  const exportSettings = useWorkspace((s) => s.exportSettings);
  const setExportSettings = useWorkspace((s) => s.setExportSettings);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("#c5572b");
  const [secondary, setSecondary] = useState("#1c1714");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected = kits.find((kit) => kit.id === selectedId);

  useEffect(() => { void listBrandKits().then(setKits).catch((cause) => setError(cause instanceof Error ? cause.message : "Brand storage is unavailable.")); }, []);
  const refresh = async () => setKits(await listBrandKits());
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); setMessage(""); try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Brand action failed. Retry in this browser."); } finally { setBusy(false); } };
  const choose = (id: string) => {
    setSelectedId(id);
    const kit = kits.find((item) => item.id === id);
    if (kit) { setName(kit.name); setPrimary(kit.primary); setSecondary(kit.secondary); }
  };
  const capture = (id: string, createdAt: number): BrandKit => {
    const result = captureBrandSettings({ ...settings, background: { ...settings.background, color: primary, color2: secondary } }, (asset) => runtime.registry.blob(asset), (asset) => files[asset]?.name);
    return { id, createdAt, updatedAt: Date.now(), name: name.trim() || "Untitled brand", primary, secondary, settings: result.settings, assets: result.assets, exportSettings };
  };

  return <div data-testid="brand-kit-panel" className="space-y-3">
    <p className="t-body-sm text-ink-3">Save your style and chosen logo locally for the next visit. Screenshots stay in this session.</p>
    <label className="block"><span className="t-micro mb-1 block text-ink-3">Saved brands</span><select aria-label="Saved brand kit" className={input} value={selectedId} onChange={(event) => choose(event.target.value)}><option value="">New brand</option>{kits.map((kit) => <option key={kit.id} value={kit.id}>{kit.name}</option>)}</select></label>
    <label className="block"><span className="t-micro mb-1 block text-ink-3">Brand name</span><input aria-label="Brand name" className={input} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Studio" /></label>
    <div className="grid grid-cols-2 gap-2">{([ ["Primary", primary, setPrimary], ["Secondary", secondary, setSecondary] ] as const).map(([label, value, setter]) => <label key={label} className="min-w-0"><span className="t-micro mb-1 block text-ink-3">{label} color</span><input aria-label={`${label} brand color`} className="h-11 w-full rounded-sm border border-line bg-surface p-1" type="color" value={value} onChange={(event) => setter(event.target.value)} /></label>)}</div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-accent-ink">{message}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" size="sm" disabled={busy || !name.trim()} data-testid="brand-save" onClick={() => void run(async () => { const id = selected?.id ?? crypto.randomUUID(); const kit = capture(id, selected?.createdAt ?? Date.now()); await saveBrandKit(kit); await refresh(); setSelectedId(id); setMessage(selected ? "Brand updated from this composition." : "Brand saved on this device."); })}>{selected ? "Update kit" : "Save kit"}</Button>
      {selected && <Button variant="secondary" size="sm" disabled={busy} data-testid="brand-apply" onClick={() => void run(async () => { const restored = await materializeBrandKit(selected, runtime); setBeautify(assetId, restored); setExportSettings(selected.exportSettings); setMessage(`${selected.name} applied. Every control remains editable.`); })}>Apply kit</Button>}
      {selected && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void run(async () => { await saveBrandKit({ ...selected, name: name.trim() || selected.name, primary, secondary, settings: { ...selected.settings, background: { ...selected.settings.background, color: primary, color2: secondary } } }); await refresh(); setMessage("Brand details saved."); })}>Rename / colors</Button>}
      {selected && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => { const duplicate = { ...selected, id: crypto.randomUUID(), name: `${selected.name} copy`, createdAt: Date.now(), updatedAt: Date.now() }; await saveBrandKit(duplicate); await refresh(); choose(""); setSelectedId(duplicate.id); setName(duplicate.name); setMessage("Brand duplicated."); })}>Duplicate</Button>}
      {selected && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => { await deleteBrandKit(selected.id); await refresh(); setSelectedId(""); setName(""); setMessage("Brand deleted from this browser."); })}>Delete</Button>}
    </div>
  </div>;
}
