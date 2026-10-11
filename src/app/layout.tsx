import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { isIndexable, SITE, SOCIAL_IMAGE } from "@/config/site";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

// Self-host the original visual system so builds never depend on a font CDN.
const playfair = localFont({
  src: [
    { path: "../assets/fonts/ui/PlayfairDisplay-Medium.ttf", weight: "500", style: "normal" },
    { path: "../assets/fonts/ui/PlayfairDisplay-Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-playfair",
  display: "swap",
});
const inter = localFont({
  src: [
    { path: "../assets/fonts/ui/Inter-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/ui/Inter-Medium.ttf", weight: "500", style: "normal" },
    { path: "../assets/fonts/ui/Inter-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = localFont({
  src: [
    { path: "../assets/fonts/ui/IBMPlexMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/ui/IBMPlexMono-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: "Shotexa – Free Private Screenshot Tools Online", template: "%s" },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: "website", siteName: SITE.name, locale: "en_US", url: "/", images: [SOCIAL_IMAGE] },
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
      <body className="min-h-dvh bg-page text-ink">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
