import type { BeautifySettings } from "@/core/beautify/types";
import type { ExportSettings } from "@/core/runtime/types";
import type { WorkspaceRuntime } from "@/core/runtime/runtime";

const DB_NAME = "shotexa-brand-kits-v1";
const STORE = "kits";
export const MAX_BRAND_ASSET_BYTES = 12 * 1024 * 1024;

export interface BrandAsset { key: string; name: string; blob: Blob }
interface StoredBrandAsset { key: string; name: string; type: string; bytes: ArrayBuffer }
export interface BrandKit {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  settings: BeautifySettings;
  exportSettings: ExportSettings;
  assets: BrandAsset[];
  createdAt: number;
  updatedAt: number;
}
type StoredBrandKit = Omit<BrandKit, "assets"> & { assets: (StoredBrandAsset | BrandAsset)[] };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Local brand storage is unavailable in this browser.")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Local brand storage could not be opened."));
    request.onblocked = () => reject(new Error("Close other Shotexa tabs and retry saving this brand."));
  });
}

async function operation<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, finish: (value: T) => void) => void): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    let value: T;
    const tx = db.transaction(STORE, mode);
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { const reason = tx.error?.name ?? "StorageError"; db.close(); reject(new Error(`Brand storage is full or unavailable (${reason}). Free browser storage and retry.`)); };
    tx.onabort = () => { db.close(); reject(new Error("Brand storage was interrupted. Please retry.")); };
    try { run(tx.objectStore(STORE), (result) => { value = result; }); }
    catch (error) { db.close(); reject(error); }
  });
}

export async function listBrandKits(): Promise<BrandKit[]> {
  const stored = await operation<StoredBrandKit[]>("readonly", (store, finish) => { const request = store.getAll(); request.onsuccess = () => finish(request.result as StoredBrandKit[]); });
  return stored.map((kit) => ({
    ...kit,
    assets: kit.assets.map((asset) => "blob" in asset ? asset : { key: asset.key, name: asset.name, blob: new Blob([asset.bytes], { type: asset.type }) }),
  })).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveBrandKit(kit: BrandKit): Promise<void> {
  if (!kit.name.trim()) throw new Error("Give this brand a name before saving.");
  if (kit.assets.reduce((sum, asset) => sum + asset.blob.size, 0) > MAX_BRAND_ASSET_BYTES) throw new Error("Brand images exceed 12 MB. Choose smaller logo files.");
  // ArrayBuffer values work in IndexedDB across Chromium and WebKit; keep Blobs in memory only.
  const assets: StoredBrandAsset[] = await Promise.all(kit.assets.map(async (asset) => ({ key: asset.key, name: asset.name, type: asset.blob.type, bytes: await asset.blob.arrayBuffer() })));
  await operation<void>("readwrite", (store) => { store.put({ ...kit, assets, name: kit.name.trim().slice(0, 80), updatedAt: Date.now() }); });
}
export async function deleteBrandKit(id: string): Promise<void> {
  await operation<void>("readwrite", (store) => { store.delete(id); });
}

/** Convert session asset IDs to stable kit slots. Only explicitly chosen brand images are saved. */
export function captureBrandSettings(settings: BeautifySettings, getBlob: (id: string) => Blob | undefined, getName: (id: string) => string | undefined): { settings: BeautifySettings; assets: BrandAsset[] } {
  const assets: BrandAsset[] = [];
  const slots = new Map<string, string>();
  const slot = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (slots.has(id)) return slots.get(id)!;
    const blob = getBlob(id);
    if (!blob) throw new Error("A selected brand image is unavailable. Reupload it before saving.");
    const key = `kit-asset-${assets.length}`;
    // Store a plain Blob independent of picker File metadata; keep the name separately.
    assets.push({ key, name: getName(id) ?? "brand-image.png", blob: new Blob([blob], { type: blob.type }) });
    slots.set(id, key);
    return key;
  };
  const clean: BeautifySettings = {
    ...settings,
    // A brand style is for one screenshot at a time, never a saved composition of uploaded screenshots.
    composition: { ...settings.composition, layout: "single", assetIds: [], selectedAssetId: null, items: {} },
    background: { ...settings.background, assetId: settings.background.kind === "custom-image" ? slot(settings.background.assetId) : null },
    branding: { ...settings.branding, assetId: slot(settings.branding.assetId) },
    watermarks: (settings.watermarks ?? []).map((layer) => ({ ...layer, assetId: layer.kind === "image" ? slot(layer.assetId) : null })),
  };
  return { settings: clean, assets };
}

export function restoreBrandSettings(settings: BeautifySettings, ids: Record<string, string>): BeautifySettings {
  const restore = (key: string | null | undefined) => key ? ids[key] ?? null : null;
  return {
    ...settings,
    background: { ...settings.background, assetId: restore(settings.background.assetId) },
    branding: { ...settings.branding, assetId: restore(settings.branding.assetId) },
    watermarks: (settings.watermarks ?? []).map((layer) => ({ ...layer, assetId: restore(layer.assetId) })),
  };
}

/** Materialize only saved brand assets into this temporary workspace on explicit Apply. */
export async function materializeBrandKit(kit: BrandKit, runtime: WorkspaceRuntime): Promise<BeautifySettings> {
  const ids: Record<string, string> = {};
  try {
    for (const asset of kit.assets) {
      const result = await runtime.ingestResource(new File([asset.blob], asset.name, { type: asset.blob.type }));
      const id = result.added[0];
      if (!id) throw new Error(`Could not load ${asset.name}. Check the saved brand image and browser storage.`);
      ids[asset.key] = id;
    }
    return restoreBrandSettings(kit.settings, ids);
  } catch (error) {
    for (const id of Object.values(ids)) runtime.removeFile(id);
    throw error;
  }
}
