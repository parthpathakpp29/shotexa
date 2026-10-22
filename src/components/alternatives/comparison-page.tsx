import Link from "next/link";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SiteFooter } from "@/components/site/site-footer";

export interface Comparison {
  competitor: string;
  lead: string;
  overview: string;
  rows: { topic: string; shotexa: string; competitor: string }[];
  shotexaFit: string;
  competitorFit: string;
  caveat: string;
  links: { label: string; href: `/${string}`; detail: string }[];
  faq: { q: string; a: string }[];
  sources: { label: string; url: string }[];
}

export function ComparisonPage({ comparison: c }: { comparison: Comparison }) {
  return <><WorkspaceSiteHeader /><main className="mx-auto max-w-[1080px] px-4 py-12 sm:px-6 sm:py-18">
    <nav aria-label="Breadcrumb" className="t-micro flex flex-wrap items-center gap-2 text-ink-3"><Link href="/">Home</Link><span aria-hidden>/</span><Link href="/alternatives">Alternatives</Link><span aria-hidden>/</span><span className="text-ink">{c.competitor}</span></nav>
    <header className="mt-8 max-w-[800px]"><p className="t-micro text-accent-ink">Workflow comparison · Published by Shotexa</p><h1 className="t-display mt-3">Shotexa vs {c.competitor}</h1><p className="t-body mt-5 text-ink-2">{c.lead}</p><p className="t-body-sm mt-5 text-ink-3">Reviewed 20 October 2026 against the official product pages linked below. Features may change.</p></header>
    <section className="mt-12" aria-labelledby="comparison-overview"><h2 id="comparison-overview" className="t-h2">The practical difference</h2><p className="t-body mt-4 max-w-[850px] text-ink-2">{c.overview}</p></section>
    <section className="mt-12" aria-labelledby="feature-comparison"><h2 id="feature-comparison" className="t-h2">Workflow comparison</h2><div className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">Shotexa and {c.competitor} feature comparison</caption><thead className="bg-surface-2"><tr><th scope="col" className="p-4">Question</th><th scope="col" className="p-4">Shotexa</th><th scope="col" className="p-4">{c.competitor}</th></tr></thead><tbody className="divide-y divide-line">{c.rows.map((row) => <tr key={row.topic}><th scope="row" className="p-4 font-medium">{row.topic}</th><td className="p-4 text-ink-2">{row.shotexa}</td><td className="p-4 text-ink-2">{row.competitor}</td></tr>)}</tbody></table></div></section>
    <section className="mt-12 grid gap-5 md:grid-cols-2" aria-label="Who each product fits"><div className="rounded-xl border border-accent-line bg-accent-soft p-6"><h2 className="t-h3">When Shotexa fits better</h2><p className="t-body-sm mt-3 text-ink-2">{c.shotexaFit}</p></div><div className="rounded-xl border border-line bg-surface p-6"><h2 className="t-h3">When {c.competitor} fits better</h2><p className="t-body-sm mt-3 text-ink-2">{c.competitorFit}</p></div></section>
    <p className="t-body-sm mt-7 rounded-xl border border-line bg-surface-2 p-5 text-ink-2">{c.caveat}</p>
    <section className="mt-14" aria-labelledby="try-workflow"><h2 id="try-workflow" className="t-h2">Try the matching Shotexa workflow</h2><div className="mt-5 grid gap-3 sm:grid-cols-3">{c.links.map((link) => <Link key={link.href} href={link.href} className="rounded-xl border border-line bg-surface p-5 hover:border-accent-line hover:bg-accent-soft"><span className="font-medium text-accent-ink">{link.label} →</span><span className="mt-2 block text-sm text-ink-2">{link.detail}</span></Link>)}</div></section>
    <section className="mt-14" aria-labelledby="questions"><h2 id="questions" className="t-h2">Common questions</h2><dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface">{c.faq.map((item) => <div key={item.q} className="p-5"><dt className="font-medium">{item.q}</dt><dd className="t-body-sm mt-2 text-ink-2">{item.a}</dd></div>)}</dl></section>
    <section className="mt-12 rounded-xl border border-line bg-surface-2 p-6" aria-label="Official sources"><h2 className="t-h3">Official sources</h2><p className="t-body-sm mt-2 text-ink-2">This comparison is published by Shotexa. Competitor descriptions come from these official pages; our own capabilities were checked against the live tools in this repository.</p><ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">{c.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline underline-offset-2">{source.label} ↗</a></li>)}</ul></section>
  </main><SiteFooter /></>;
}
