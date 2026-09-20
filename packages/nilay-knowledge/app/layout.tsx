import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';

import { Footer } from '@/components/footer';
import { GoogleAnalytics } from '@/components/google-analytics';
import { Header } from '@/components/header';
import { SkipLink } from '@/components/skip-link';
import { siteConfig } from '@/lib/config';
import './globals.css';

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.siteUrl),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.title}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: siteConfig.siteUrl,
    siteName: siteConfig.title,
    title: siteConfig.title,
    description: siteConfig.description,
    images: [
      {
        url: '/ogp.png',
        width: 1200,
        height: 630,
        alt: siteConfig.title,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: `@${siteConfig.social.twitter}`,
    creator: `@${siteConfig.social.twitter}`,
  },
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <SkipLink />
        <GoogleAnalytics />
        <Header />
        <main id="main-content" className="min-h-screen">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
