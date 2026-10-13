import { sitemapPaths } from "@/config/routes";
import { toolByRoute, type ToolId } from "@/config/tools";

export const GA_MEASUREMENT_ID = "G-912D4G6Z2B";
export const ANALYTICS_PREFERENCE_KEY = "shotexa.analytics-consent.v1";
export const VERCEL_ANALYTICS_OPT_OUT_KEY = "shotexa.vercel-analytics-opt-out.v1";

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

/** Preserve a rejection saved when the old control covered both services. */
export function vercelAnalyticsEnabled(previousGoogleChoice?: AnalyticsPreference): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.localStorage.getItem(VERCEL_ANALYTICS_OPT_OUT_KEY);
    if (saved === null && previousGoogleChoice === "rejected") {
      window.localStorage.setItem(VERCEL_ANALYTICS_OPT_OUT_KEY, "true");
      return false;
    }
    return saved !== "true";
  } catch {
    return false;
  }
}

export function saveVercelAnalyticsEnabled(enabled: boolean): boolean {
  try {
    window.localStorage.setItem(VERCEL_ANALYTICS_OPT_OUT_KEY, enabled ? "false" : "true");
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

export function safeAnalyticsUrl(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== window.location.origin) return null;
    const path = safeAnalyticsPath(parsed.pathname);
    return path ? `${window.location.origin}${path}` : null;
  } catch {
    return null;
  }
}

/** The SDK sends document.referrer separately from beforeSend's URL field. */
export function safeVercelReferrer(referrer: string): boolean {
  if (!referrer) return true;
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(referrer);
    if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    return parsed.origin === window.location.origin ? safeAnalyticsPath(parsed.pathname) !== null : parsed.pathname === "/";
  } catch {
    return false;
  }
}

export function configureAnalytics(pathname: string): boolean {
  const path = safeAnalyticsPath(pathname);
  if (analyticsPreference() !== "accepted" || !path) return false;
  if (window.__shotexaGaConfigured) return true;
  window.dataLayer ??= [];
  // gtag.js consumes the standard Arguments queue entries, not arrays of parameters.
  window.gtag = function gtag() {
    // gtag.js requires the native Arguments object, so rest parameters cannot replace this.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
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
  if (event !== "tool_opened" && event !== "upload_completed" && event !== "export_completed" && event !== "workflow_completed") return;
  const path = safeAnalyticsPath(window.location.pathname);
  if (!path) return;
  const tool = toolByRoute(path);
  if (event === "tool_opened" && (!tool || tool.id !== toolId)) return;
  const params: Record<string, string> = { page_location: `${window.location.origin}${path}`, page_referrer: "" };
  if (event === "tool_opened" && tool) params.tool_id = tool.id;
  window.gtag?.("event", event, params);
}

export function disableAnalytics(): void {
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
  }
}
