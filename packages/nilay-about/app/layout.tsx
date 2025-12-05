import type { Metadata } from "next";
import { RetroHeader, RetroFooter } from "@/components/layout";
import { Providers } from "@/components/providers";
import { siteConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: siteConfig.title,
    template: `%s : ${siteConfig.title}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.siteUrl),
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.description,
    url: siteConfig.siteUrl,
    siteName: siteConfig.title,
    images: [
      {
        url: siteConfig.image,
        width: 1200,
        height: 630,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: siteConfig.title,
    description: siteConfig.description,
    site: `@${siteConfig.social.twitter}`,
    creator: `@${siteConfig.social.twitter}`,
    images: [
      "https://cdn.nilay.jp/ecommerce/res/40f542fd0fd0bf4b5b60be43e49007bfabc0b9e7.png",
    ],
  },
  other: {
    "fb:app_id": siteConfig.social.facebookAppId,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <Providers>
          <RetroHeader />
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <RetroFooter />
        </Providers>
      </body>
    </html>
  );
}
