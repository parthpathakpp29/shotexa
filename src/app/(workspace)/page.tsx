import { HomeView } from "@/components/home/home-view";
import { ContinuousSection, FaqSection, FinalCta, Hero, PrinciplesSection, PrivacySection } from "@/components/home/sections";
import { WorkflowSection } from "@/components/home/workflow";
import { SiteFooter } from "@/components/site/site-footer";
import { staticMetadata } from "@/config/routes";

export const metadata = staticMetadata("/");

export default function HomePage() {
  return (
    <HomeView
      marketing={
        <>
          <Hero />
          <WorkflowSection />
          <PrinciplesSection />
          <ContinuousSection />
          <PrivacySection />
          <FaqSection />
          <FinalCta />
        </>
      }
      footer={<SiteFooter />}
    />
  );
}
