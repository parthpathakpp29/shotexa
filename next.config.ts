import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Vendor paths include dependency/model versions. OCR, OpenCV and PDF assets are
        // immutable for that URL and should not be re-downloaded after their first use.
        source: "/vendor/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // These public URLs are stable rather than content-hashed. Keep a shared CDN copy
        // hot, but make browsers revalidate so a future deployment cannot show a stale
        // poster or recording.
        source: "/product/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
