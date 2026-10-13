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
    title: "Cookieless Vercel Analytics",
    body: "Where permitted, Vercel Web Analytics automatically counts visits to known public pages for basic traffic statistics. It does not use cookies. Vercel may process the public page URL, time, referring site, approximate location, browser, operating system and device type, and uses a short-lived request hash to estimate visitors. Shotexa strips query strings, fragments and credentials from page URLs and excludes unknown routes and unsafe referrers. We do not send screenshots, filenames, recognised text, detected secrets, extracted data or workflow inputs. You can turn Vercel Analytics off through Analytics choices in the footer.",
  },
  {
    title: "Optional Google Analytics",
    body: "Google Analytics 4 (Google LLC) loads only after you explicitly accept it. It uses analytics cookies to count public page views and approved actions: opening a tool, adding a screenshot, starting an export download and finishing a workflow. It receives an allowlisted public page URL without query strings or fragments, and a validated tool ID when you open a tool. Google may also receive standard browser and device information. Shotexa disables advertising consent, advertising personalisation and Google Signals.",
  },
  {
    title: "Your analytics choice",
    body: "Accept Google Analytics enables Google Analytics; Reject Google Analytics or ignoring the choice keeps it off. Vercel Analytics continues independently unless you turn it off with its separate control. If you rejected analytics under our earlier combined choice, we keep Vercel Analytics off until you turn it on. Your choices are saved in this browser's local storage and can be changed through Analytics choices in the footer. Switching off either service reloads the page to stop its tag. None of these choices affects the screenshot tools.",
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
