"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toolByRoute } from "@/config/tools";
import { analyticsPreference, configureAnalytics, disableAnalytics, GA_MEASUREMENT_ID, saveAnalyticsPreference, safeAnalyticsPath, trackAnalyticsEvent, trackPageView, type AnalyticsPreference } from "@/lib/analytics";

const PREFERENCES_EVENT = "shotexa:analytics-preferences";

export function AnalyticsPreferencesButton() {
  return <button type="button" onClick={() => window.dispatchEvent(new Event(PREFERENCES_EVENT))} className="t-body-sm inline-flex min-h-10 items-center text-white/65 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:min-h-0">Analytics choices</button>;
}

export function AnalyticsConsent({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const [preference, setPreference] = useState<AnalyticsPreference | "loading">("loading");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const lastPage = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = analyticsPreference();
      if (enabled && saved === "accepted") configureAnalytics(window.location.pathname);
      setPreference(saved);
    }, 0);
    const open = () => setSettingsOpen(true);
    const onDownload = (event: MouseEvent) => {
      const link = event.target;
      if (link instanceof HTMLAnchorElement && link.hasAttribute("download") && link.href.startsWith("blob:") && link.dataset.analyticsIgnore !== "true") {
        trackAnalyticsEvent("export_completed");
      }
    };
    window.addEventListener(PREFERENCES_EVENT, open);
    document.addEventListener("click", onDownload, true);
    return () => { window.clearTimeout(timer); window.removeEventListener(PREFERENCES_EVENT, open); document.removeEventListener("click", onDownload, true); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || preference !== "accepted" || !ready) { lastPage.current = null; return; }
    const path = safeAnalyticsPath(pathname);
    if (!path || lastPage.current === path) return;
    lastPage.current = path;
    trackPageView(path);
    const tool = toolByRoute(path);
    if (tool) trackAnalyticsEvent("tool_opened", tool.id);
  }, [enabled, preference, ready, pathname]);

  if (!enabled) return null;

  function choose(value: Exclude<AnalyticsPreference, null>) {
    if (!saveAnalyticsPreference(value)) { setStorageError(true); return; }
    setStorageError(false);
    setSettingsOpen(false);
    if (value === "rejected" && preference === "accepted") {
      disableAnalytics();
      window.location.reload();
      return;
    }
    if (value === "accepted") configureAnalytics(window.location.pathname);
    setPreference(value);
  }

  return <>
    {preference === "accepted" && <Script
      id="shotexa-ga4"
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      strategy="lazyOnload"
      onReady={() => { if (configureAnalytics(window.location.pathname)) setReady(true); }}
    />}
    {(preference === null || settingsOpen) && <section role="region" aria-label="Analytics choices" className="fixed inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-y-auto overscroll-contain border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-md sm:inset-x-4 sm:bottom-4 sm:mx-auto sm:max-w-2xl sm:rounded-xl sm:border sm:p-5">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-display text-xl text-ink">Your analytics choice</h2>
        <p className="t-body-sm mt-2 text-ink-2">Shotexa works without analytics. If you accept, Google Analytics uses cookies to count page visits and basic tool actions. Screenshots and their contents stay on your device. You can change your choice here later.</p>
        <Link href="/privacy" className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-accent-ink underline-offset-4 hover:underline">Read the privacy details</Link>
        {storageError && <p role="alert" className="text-sm text-error">This browser cannot save your choice, so analytics stays off.</p>}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" className="w-full" onClick={() => choose("rejected")}>Reject analytics</Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => choose("accepted")}>Accept analytics</Button>
        </div>
      </div>
    </section>}
  </>;
}
