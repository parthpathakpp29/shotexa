import Link from "next/link";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { ToolEducation } from "@/components/workspace/tool-education";
import { TOOLS, type ToolId } from "@/config/tools";
import { ConversionTool } from "./conversion-tool";

export function ConversionPage({ tool }: { tool: "pdf-to-jpg" | "svg-to-png" }) {
  const t = TOOLS[tool];
  return <>
    <SiteHeader />
    <main>
      <section className="mx-auto max-w-[1100px] px-4 pb-14 pt-10 sm:px-6 sm:pt-16">
        <nav aria-label="Breadcrumb" className="t-micro mb-5 flex gap-2 text-ink-3"><Link href="/">Home</Link><span aria-hidden>/</span><Link href="/tools">Tools</Link><span aria-hidden>/</span><span className="text-ink">{t.name}</span></nav>
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
          <div className="pt-3">
            <p className="t-micro text-accent-ink">Free browser converter</p>
            <h1 className="t-display mt-3">{t.seo.h1}</h1>
            <p className="t-body mt-5 max-w-xl text-ink-2">{t.seo.description}</p>
            <p className="t-body-sm mt-5 text-ink-3">Files stay on your device · No account · No watermark</p>
          </div>
          <ConversionTool tool={tool} />
        </div>
      </section>
      <ToolEducation tool={tool as ToolId} />
    </main>
    <SiteFooter />
  </>;
}
