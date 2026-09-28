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
    ];
  },
};

export default nextConfig;
