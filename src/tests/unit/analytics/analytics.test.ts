import { afterEach, describe, expect, it, vi } from "vitest";
import { analyticsPreference, configureAnalytics, safeAnalyticsPath, trackAnalyticsEvent, trackPageView } from "@/lib/analytics";

afterEach(() => vi.unstubAllGlobals());

describe("analytics privacy boundary", () => {
  it("only accepts known public paths and drops query strings and unknown routes", () => {
    expect(safeAnalyticsPath("/screenshot-to-text")).toBe("/screenshot-to-text");
    expect(safeAnalyticsPath("/workflows/")).toBe("/workflows");
    expect(safeAnalyticsPath("/workflows?secret=123")).toBeNull();
    expect(safeAnalyticsPath("/private/secret-123")).toBeNull();
    expect(safeAnalyticsPath("/spikes/ocr")).toBeNull();
  });

  it("never queues events before consent, then only sends allowlisted values and clean URLs", () => {
    const values = new Map<string, string>();
    const browser = {
      location: { origin: "https://shotexa.com", pathname: "/screenshot-to-text", search: "?secret=123" },
      localStorage: { getItem: (key: string) => values.get(key) ?? null },
      dataLayer: [] as unknown[],
    };
    vi.stubGlobal("window", browser);
    expect(analyticsPreference()).toBeNull();
    trackAnalyticsEvent("upload_completed");
    expect(browser.dataLayer).toHaveLength(0);

    values.set("shotexa.analytics-consent.v1", "accepted");
    expect(configureAnalytics(browser.location.pathname)).toBe(true);
    trackPageView(browser.location.pathname);
    trackAnalyticsEvent("tool_opened", "extract-text");
    trackAnalyticsEvent("export_completed");
    const sent = JSON.stringify(browser.dataLayer);
    expect(sent).toContain("tool_opened");
    expect(sent).toContain("extract-text");
    expect(sent).toContain("export_completed");
    expect(sent).not.toContain("secret=123");
    expect(sent).not.toContain("screenshot-to-text?");
  });
});
