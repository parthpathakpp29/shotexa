import Link from "next/link";
import type { FormatConversion } from "@/config/format-conversions";

export function FormatEducation({ conversion }: { conversion: FormatConversion }) {
  return <section className="mx-auto max-w-[1100px] px-4 pb-20 sm:px-6" aria-label={`${conversion.name} guide`}>
    <div className="grid gap-8 border-t border-line pt-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <div>
        <h2 className="t-h2">When to use {conversion.output} instead of {conversion.source}</h2>
        <p className="t-body mt-4 max-w-2xl text-ink-2">{conversion.intro}</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {conversion.benefits.map((item) => <div key={item.title} className="rounded-xl border border-line bg-surface p-5"><h3 className="font-semibold">{item.title}</h3><p className="t-body-sm mt-2 text-ink-2">{item.detail}</p></div>)}
        </div>
      </div>
      <aside className="rounded-xl border border-line bg-surface-2 p-6">
        <h2 className="t-h3">Know before converting</h2>
        <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-ink-2">{conversion.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
        <p className="mt-5 text-sm text-ink-2">The conversion runs in this browser. Converted images can continue into the temporary Shotexa workspace.</p>
      </aside>
    </div>
    <div className="mt-14 grid gap-10 lg:grid-cols-2">
      <div><h2 className="t-h2">Common questions</h2><dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface">{conversion.faq.map((item) => <div key={item.q} className="p-5"><dt className="font-medium">{item.q}</dt><dd className="t-body-sm mt-2 text-ink-2">{item.a}</dd></div>)}</dl></div>
      <div><h2 className="t-h2">Continue with Shotexa</h2><p className="t-body-sm mt-4 text-ink-2">Choose another real converter or open a result in the connected workspace.</p><div className="mt-5 grid gap-3">{conversion.related.map((item) => <Link key={item.href} href={item.href} className="rounded-xl border border-line bg-surface px-5 py-4 font-medium text-accent-ink hover:border-accent-line hover:bg-accent-soft">{item.label} →</Link>)}</div></div>
    </div>
  </section>;
}
