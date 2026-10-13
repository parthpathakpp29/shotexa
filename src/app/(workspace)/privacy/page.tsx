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
    body: "Screenshots stay available while you move between Shotexa tools in the same tab. Closing or refreshing the tab clears them. Shotexa does not store your screenshots in browser storage or anywhere else. The only things kept between visits are small preferences you create yourself, such as a saved workflow recipe or a custom detection rule, and those stay in this browser.",
  },
  {
    title: "No account",
    body: "You don’t need to sign up or sign in to use Shotexa.",
  },
  {
    title: "What is downloaded to your browser",
    body: "Like any website, Shotexa’s pages and code are downloaded from our servers. The heavier engines are not: the image-alignment engine used by Smart Stitch, the text-recognition engine and its language data, and the background-removal model and its runtime are each downloaded only when you first use the tool that needs them, and they are served from Shotexa rather than a third party.",
  },
  {
    title: "Reading, analysing and comparing happen locally too",
    body: "Extracting text, finding likely sensitive details, pulling tables out of a screenshot, removing a background and comparing two screenshots all run in this tab. The recognised text, the detected findings and the comparison results are never sent anywhere, and nothing falls back to a server if your device cannot do the work.",
  },
  {
    title: "Exports",
    body: "When you export, the file is created in your browser and saved through your browser’s normal download. Where it goes from there is up to you.",
  },
  {
    title: "Optional analytics",
    body: "If you accept analytics, Shotexa loads Google Analytics 4 (Google LLC) to count visits and basic actions: opening a tool, adding a screenshot, starting an export download and finishing a workflow. It uses analytics cookies and receives the public page path, without query strings, and the tool ID when you open a tool. Vercel Analytics counts page views on known public pages; it does not receive query strings or unknown routes. We do not send screenshots, filenames, recognised text, detected secrets, extracted data or your workflow inputs. We do not use advertising personalization. Google may also receive standard browser and device information when its tag runs.",
  },
  {
    title: "Your analytics choice",
    body: "Analytics is off until you choose Accept analytics. If you reject, Shotexa does not load Google Analytics or Vercel Analytics. We save your choice in this browser's local storage; you can change it later through Analytics choices in the footer. Rejecting after accepting reloads the page to remove the tags. This choice does not affect any screenshot tool.",
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
