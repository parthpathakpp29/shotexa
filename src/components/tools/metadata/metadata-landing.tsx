import Link from "next/link";
import { SectionHeading } from "@/components/ui/primitives";
import { ToolLanding } from "@/components/workspace/tool-landing";

export function MetadataLanding() {
  return (
    <ToolLanding tool="metadata" dropHint="or drag and drop a JPEG, PNG or WebP image here">
      <section className="border-t border-line bg-surface-3/60 py-16">
        <div className="mx-auto max-w-[1060px] px-4 sm:px-6">
          <SectionHeading eyebrow="How it works" title="Inspect, clean, then" accent="verify" />
          <ol className="mt-9 grid gap-4 md:grid-cols-3">
            {[
              ["Inspect locally", "Shotexa reads the image container and shows privacy-sensitive metadata without uploading the file."],
              ["Privacy Clean", "GPS, private EXIF/device details, XMP, comments, software identifiers and hidden thumbnails are removed."],
              ["Verify the output", "The cleaned container is parsed again. Dimensions and required colour/rendering metadata are checked before download."],
            ].map(([title, body], i) => <li key={title} className="rounded-xl border border-line bg-surface p-6 shadow-xs"><span className="t-mono text-accent-ink">0{i + 1}</span><h2 className="t-h3 mt-3">{title}</h2><p className="t-body-sm mt-2 text-ink-2">{body}</p></li>)}
          </ol>
          <p className="t-body-sm mt-6 text-center text-ink-2">Pixel data is not decoded or recompressed for metadata-only cleaning. <Link href="/privacy" className="text-accent-ink underline-offset-4 hover:underline">Learn about Shotexa privacy.</Link></p>
        </div>
      </section>
      <section className="py-16"><div className="mx-auto max-w-[760px] px-4 sm:px-6"><SectionHeading eyebrow="Questions" title="Privacy Clean," accent="answered" /><dl className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">{[
        ["Which formats are supported?", "JPEG/JPG, PNG and WebP in V1."],
        ["Will colour profiles be removed?", "No. ICC and required colour/rendering information are preserved because they can affect how the image looks."],
        ["What if the file is already clean?", "Shotexa reports that no privacy-sensitive metadata was found and returns the original file without rewriting it."],
      ].map(([q, a]) => <div key={q} className="px-5 py-4"><dt className="font-display text-[1.0625rem]">{q}</dt><dd className="t-body-sm mt-1.5 text-ink-2">{a}</dd></div>)}</dl></div></section>
      <section className="border-t border-line bg-surface-3/60 py-12">
        <div className="mx-auto max-w-[760px] px-4 sm:px-6">
          <p className="t-micro text-accent-ink">Related tools</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/redact-screenshot" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Safe Share</Link>
            <Link href="/blur-screenshot" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Blur Screenshot</Link>
            <Link href="/stitch-screenshots" className="rounded-md border border-line bg-surface px-4 py-3 text-sm font-medium shadow-xs hover:border-line-strong">Smart Stitch</Link>
          </div>
        </div>
      </section>
    </ToolLanding>
  );
}
