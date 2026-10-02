import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Playfair_Display } from "next/font/google";
import { isIndexable, SITE } from "@/config/site";
import "./globals.css";

// Display serif (headings, italic accent words) · UI/body sans · restrained mono for values.
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-playfair", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Shotexa – Free Private Screenshot Tools Online", template: "%s" },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: "website", siteName: SITE.name, locale: "en_US", url: "/" },
  twitter: { card: "summary_large_image" },
  robots: isIndexable() ? { index: true, follow: true } : { index: false, follow: false },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#f8f6f1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${plexMono.variable} antialiased`}>
      <body className="min-h-dvh bg-page text-ink">{children}</body>
    </html>
  );
}
