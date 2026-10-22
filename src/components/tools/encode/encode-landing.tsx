import Link from "next/link";
import { ToolLanding } from "@/components/workspace/tool-landing";
import { FORMAT_CONVERSION_LIST } from "@/config/format-conversions";
import type { EncodeTool } from "@/core/image-encode/types";

/** Uploader first, then the shared explanation from `config/tool-content.ts`. */
export function EncodeLanding({ tool }: { tool: EncodeTool }) {
  return <ToolLanding tool={tool}>{tool === "convert" && <section className="mx-auto max-w-[1100px] px-4 pb-14 sm:px-6" aria-labelledby="format-paths"><h2 id="format-paths" className="t-h2">Choose a specific conversion</h2><p className="t-body-sm mt-3 text-ink-2">The same local converter powers these focused workflows. Pick the source and output you need; your workspace images stay available as you move between pages.</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FORMAT_CONVERSION_LIST.map((conversion) => <Link key={conversion.id} href={`/${conversion.id}`} className="rounded-xl border border-line bg-surface p-5 transition-colors hover:border-accent-line hover:bg-accent-soft"><span className="font-display text-lg">{conversion.name}</span><span className="mt-2 block text-sm text-ink-2">{conversion.source} → {conversion.output} · {conversion.engine === "raster" ? "Image" : conversion.engine.toUpperCase()} workflow</span></Link>)}</div></section>}</ToolLanding>;
}
