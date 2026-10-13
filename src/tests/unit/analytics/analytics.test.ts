import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsPreference, configureAnalytics, safeAnalyticsPath, safeAnalyticsUrl, safeVercelReferrer, saveAnalyticsPreference, saveVercelAnalyticsEnabled, trackAnalyticsEvent, trackPageView, vercelAnalyticsEnabled } from "@/lib/analytics";

afterEach(() => vi.unstubAllGlobals());

describe("analytics privacy boundary", () => {
  it("only accepts known public paths and drops query strings and unknown routes", () => {
    expect(safeAnalyticsPath("/screenshot-to-text")).toBe("/screenshot-to-text");
    expect(safeAnalyticsPath("/workflows/")).toBe("/workflows");
    expect(safeAnalyticsPath("/workflows?secret=123")).toBeNull();
    expect(safeAnalyticsPath("/private/secret-123")).toBeNull();
    expect(safeAnalyticsPath("/spikes/ocr")).toBeNull();
  });

  it("returns only same-origin absolute allowlisted Vercel URLs without query or hash", () => {
    vi.stubGlobal("window", { location: { origin: "https://shotexa.com" } });
    expect(safeAnalyticsUrl("https://shotexa.com/workflows?private=secret#fragment")).toBe("https://shotexa.com/workflows");
    expect(safeAnalyticsUrl("https://shotexa.com/privacy?private=secret")).toBe("https://shotexa.com/privacy");
    expect(safeAnalyticsUrl("https://shotexa.com/")).toBe("https://shotexa.com/");
    expect(safeAnalyticsUrl("/workflows")).toBeNull();
    expect(safeAnalyticsUrl("https://evil.example/privacy")).toBeNull();
    expect(safeAnalyticsUrl("javascript:/privacy")).toBeNull();
    expect(safeAnalyticsUrl("https://user:pass@shotexa.com/privacy")).toBe("https://shotexa.com/privacy");
    expect(safeAnalyticsUrl("/private/secret-123")).toBeNull();
    expect(safeAnalyticsUrl("not a url%")).toBeNull();
  });

  it("blocks unsafe referrers that the Vercel SDK would send separately", () => {
    vi.stubGlobal("window", { location: { origin: "https://shotexa.com" } });
    expect(safeVercelReferrer("")).toBe(true);
    expect(safeVercelReferrer("https://shotexa.com/tools")).toBe(true);
    expect(safeVercelReferrer("https://news.example/")).toBe(true);
    expect(safeVercelReferrer("https://shotexa.com/tools?token=secret")).toBe(false);
    expect(safeVercelReferrer("https://shotexa.com/private/user-file")).toBe(false);
    expect(safeVercelReferrer("https://news.example/private-user-page")).toBe(false);
    expect(safeVercelReferrer("https://news.example/#private")).toBe(false);
    expect(safeVercelReferrer("https://user:password@news.example/")).toBe(false);
    expect(safeVercelReferrer("not-a-url")).toBe(false);
  });

  it("persists a separate Vercel objection and fails closed if storage is unavailable", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    } });
    expect(vercelAnalyticsEnabled()).toBe(true);
    expect(saveVercelAnalyticsEnabled(false)).toBe(true);
    expect(vercelAnalyticsEnabled()).toBe(false);
    expect(saveVercelAnalyticsEnabled(true)).toBe(true);
    expect(vercelAnalyticsEnabled()).toBe(true);
    values.delete("shotexa.vercel-analytics-opt-out.v1");
    values.set("shotexa.analytics-consent.v1", "rejected");
    expect(vercelAnalyticsEnabled("rejected")).toBe(false);
    expect(values.get("shotexa.vercel-analytics-opt-out.v1")).toBe("true");
    expect(saveVercelAnalyticsEnabled(true)).toBe(true);
    expect(vercelAnalyticsEnabled("rejected")).toBe(true);
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked"); } } });
    expect(vercelAnalyticsEnabled()).toBe(false);
    expect(saveVercelAnalyticsEnabled(true)).toBe(false);
  });

  it("never queues events before consent, then only sends allowlisted values and clean URLs", () => {
    const values = new Map<string, string>();
    const browser = {
      location: { origin: "https://shotexa.com", pathname: "/screenshot-to-text", search: "?secret=123" },
      localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } },
      dataLayer: [] as unknown[],
    };
    vi.stubGlobal("window", browser);
    expect(analyticsPreference()).toBeNull();
    trackAnalyticsEvent("upload_completed");
    expect(browser.dataLayer).toHaveLength(0);

    expect(saveAnalyticsPreference("accepted")).toBe(true);
    expect(analyticsPreference()).toBe("accepted");
    expect(configureAnalytics(browser.location.pathname)).toBe(true);
    expect(configureAnalytics(browser.location.pathname)).toBe(true);
    trackPageView(browser.location.pathname);
    trackAnalyticsEvent("tool_opened", "extract-text");
    trackAnalyticsEvent("tool_opened", "combine");
    trackAnalyticsEvent("export_completed");
    trackAnalyticsEvent("private_event" as "tool_opened");
    expect(browser.dataLayer.every((entry) => Object.prototype.toString.call(entry) === "[object Arguments]")).toBe(true);
    expect(browser.dataLayer.filter((entry) => (entry as IArguments)[0] === "config")).toHaveLength(1);
    expect(browser.dataLayer.filter((entry) => (entry as IArguments)[0] === "event" && (entry as IArguments)[1] === "tool_opened")).toHaveLength(1);
    const sent = JSON.stringify(browser.dataLayer);
    expect(sent).toContain("tool_opened");
    expect(sent).toContain("extract-text");
    expect(sent).toContain("export_completed");
    expect(sent).not.toContain("secret=123");
    expect(sent).not.toContain("screenshot-to-text?");
    expect(sent).not.toContain("private_event");
    expect(saveAnalyticsPreference("rejected")).toBe(true);
    expect(analyticsPreference()).toBe("rejected");
    trackPageView(browser.location.pathname);
    expect(browser.dataLayer.filter((entry) => (entry as IArguments)[0] === "event" && (entry as IArguments)[1] === "page_view")).toHaveLength(1);
  });
});
