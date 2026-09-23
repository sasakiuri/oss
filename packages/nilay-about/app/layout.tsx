import type { Metadata } from 'next';

import { JsonLd } from '@/components/json-ld';
import { LanguageBoundary } from '@/components/language-boundary';
import { MainRegion, RetroHeader, RetroFooter } from '@/components/layout';
import { Providers } from '@/components/providers';
import { siteConfig } from '@/lib/config';
import { siteJsonLd } from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.title}`,
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
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    site: `@${siteConfig.social.twitter}`,
    images: [siteConfig.image],
  },
  other: {
    'fb:app_id': siteConfig.social.facebookAppId,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The server has no way to know the reader's language, so the document opens in Japanese and
    // LanguageBoundary moves this attribute with the text once the page has loaded.
    <html lang="ja">
      <body className="min-h-screen">
        <JsonLd data={siteJsonLd()} />
        <Providers>
          <LanguageBoundary>
            <RetroHeader />
            <MainRegion>{children}</MainRegion>
            <RetroFooter />
          </LanguageBoundary>
        </Providers>
      </body>
    </html>
  );
}
