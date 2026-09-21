import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

import { Footer } from '@/components/footer';
import { GoogleAnalytics } from '@/components/google-analytics';
import { Header } from '@/components/header';
import { NavigationFocus } from '@/components/navigation-focus';
import { SkipLink } from '@/components/skip-link';
import { ThemeProvider } from '@/components/theme-provider';
import { siteConfig } from '@/lib/config';
import './globals.css';

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
    <html lang="ja" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <NuqsAdapter>
          <ThemeProvider>
            <SkipLink />
            <GoogleAnalytics />
            <Header />
            <NavigationFocus />
            <main id="main-content" tabIndex={-1} className="min-h-screen">
              {children}
            </main>
            <Footer />
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
