// SPDX-License-Identifier: MIT
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import 'remark-github-blockquote-alert/alert.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/noto-sans-jp';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import { createNavigation } from '@/entities/document/navigation';
import { getDocuments } from '@/entities/document/server/repository';
import { Sidebar, SiteHeader } from '@/features/navigation/site-navigation';
import { pageMetadata } from '@/shared/config/metadata';
import { site, withBasePath } from '@/shared/config/site';
import { structuredData } from '@/shared/lib/structured-data';
import { Telemetry } from '@/shared/telemetry/client';

import './globals.css';
import { Providers } from './providers';

const readingFont = localFont({
  src: '../../assets/fonts/NotoSansJP-Docs.woff2',
  display: 'optional',
  variable: '--font-reading',
});

export const metadata: Metadata = {
  ...pageMetadata(site.name, site.description, '/'),
  metadataBase: new URL(site.url),
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  applicationName: site.name,
  alternates: { types: { 'application/rss+xml': withBasePath('/rss.xml/') } },
  appleWebApp: { capable: true, title: site.name, statusBarStyle: 'default' },
  icons: { apple: withBasePath('/apple-touch-icon.png') },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const groups = createNavigation(getDocuments());
  return (
    <html lang="ja" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${readingFont.variable} font-sans antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: structuredData({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: site.name,
              url: site.url,
              inLanguage: 'ja',
            }),
          }}
        />
        <Telemetry />
        <Providers>
          <a
            href="#main-content"
            className="bg-brand sr-only fixed top-2 left-2 z-60 rounded px-4 py-3 text-white focus:not-sr-only"
          >
            本文へスキップ
          </a>
          <SiteHeader groups={groups} />
          <div className="docs-layout">
            <aside className="docs-sidebar">
              <div className="docs-sidebar-content">
                <Sidebar groups={groups} />
              </div>
            </aside>
            <div className="docs-content">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
