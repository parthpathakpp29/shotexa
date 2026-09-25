import { SiteFooter } from "@/components/site/site-footer";
import { WorkspaceSiteHeader } from "@/components/site/workspace-site-header";
import { SectionHeading } from "@/components/ui/primitives";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/privacy");

const POINTS = [
  {
    title: "Your screenshots are processed on your device",
    body: "When you paste, drop or choose a screenshot, your browser reads the file into this tab’s memory. Stitching, previews and exports are computed by your browser — including in background workers — without sending the image to a server.",
  },
  {
    title: "Nothing is saved after you leave",
    body: "Screenshots stay available while you move between Shotexa tools in the same tab. Closing or refreshing the tab clears them. Shotexa does not store your screenshots in browser storage or anywhere else.",
  },
  {
    title: "No account",
    body: "You don’t need to sign up or sign in to use Shotexa.",
  },
  {
    title: "What is downloaded to your browser",
    body: "Like any website, Shotexa’s pages and code are downloaded from our servers. Heavier engines — such as the image-alignment engine used by Smart Stitch — are only downloaded when you use the tool that needs them.",
  },
  {
    title: "Exports",
    body: "When you export, the file is created in your browser and saved through your browser’s normal download. Where it goes from there is up to you.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <WorkspaceSiteHeader />
      <main className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20">
        <SectionHeading level={1} align="left" eyebrow="Privacy" title="How Shotexa Keeps" accent="Screenshots Local" lead="A plain description of what happens to your files." />
        <div className="mt-10 divide-y divide-line rounded-xl border border-line bg-surface shadow-xs">
          {POINTS.map((p) => (
            <section key={p.title} className="px-6 py-5">
              <h2 className="t-h3">{p.title}</h2>
              <p className="t-body-sm mt-2 text-ink-2">{p.body}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
