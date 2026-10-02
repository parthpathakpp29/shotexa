import type { MetadataRoute } from "next";
import { isIndexable, SITE } from "@/config/site";

/** Production allows crawling (except developer spikes); previews and dev disallow everything. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/spikes/"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
