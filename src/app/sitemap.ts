import type { MetadataRoute } from "next";
import { sitemapPaths } from "@/config/routes";
import { SITE } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths().map((path) => ({
    url: `${SITE.url}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
