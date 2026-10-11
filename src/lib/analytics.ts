import { sitemapPaths } from "@/config/routes";
import { toolByRoute, type ToolId } from "@/config/tools";

export const GA_MEASUREMENT_ID = "G-912D4G6Z2B";
export const ANALYTICS_PREFERENCE_KEY = "shotexa.analytics-consent.v1";

export type AnalyticsPreference = "accepted" | "rejected" | null;
export type AnalyticsEvent = "tool_opened" | "upload_completed" | "export_completed" | "workflow_completed";
type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    __shotexaGaConfigured?: boolean;
  }
}

const allowedPaths = new Set(sitemapPaths());

export function analyticsPreference(): AnalyticsPreference {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(ANALYTICS_PREFERENCE_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export function saveAnalyticsPreference(value: Exclude<AnalyticsPreference, null>): boolean {
  try {
    window.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

/** Only known public paths reach GA. Query strings, hashes and arbitrary user paths never do. */
export function safeAnalyticsPath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return allowedPaths.has(path) ? path : null;
}

export function configureAnalytics(pathname: string): boolean {
  const path = safeAnalyticsPath(pathname);
  if (analyticsPreference() !== "accepted" || !path) return false;
  if (window.__shotexaGaConfigured) return true;
  window.dataLayer ??= [];
  window.gtag = (...args: unknown[]) => { window.dataLayer?.push(args); };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("set", { page_location: `${window.location.origin}${path}`, page_referrer: "" });
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: `${window.location.origin}${path}`,
    page_referrer: "",
  });
  window.__shotexaGaConfigured = true;
  return true;
}

export function trackPageView(pathname: string): void {
  const path = safeAnalyticsPath(pathname);
  if (!path || analyticsPreference() !== "accepted" || !window.__shotexaGaConfigured) return;
  window.gtag?.("set", { page_location: `${window.location.origin}${path}`, page_referrer: "" });
  window.gtag?.("event", "page_view", {
    page_location: `${window.location.origin}${path}`,
    page_path: path,
    page_referrer: "",
  });
}

/** No caller supplied strings or file data are forwarded; tool IDs are registry validated. */
export function trackAnalyticsEvent(event: AnalyticsEvent, toolId?: ToolId): void {
  if (typeof window === "undefined" || analyticsPreference() !== "accepted" || !window.__shotexaGaConfigured) return;
  const path = safeAnalyticsPath(window.location.pathname);
  if (!path) return;
  const tool = toolByRoute(path);
  const params: Record<string, string> = { page_location: `${window.location.origin}${path}`, page_referrer: "" };
  if (event === "tool_opened" && tool && tool.id === toolId) params.tool_id = tool.id;
  window.gtag?.("event", event, params);
}

export function disableAnalytics(): void {
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
  }
}
