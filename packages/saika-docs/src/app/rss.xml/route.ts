// SPDX-License-Identifier: MIT
import { getDocuments } from '@/entities/document/server/repository';
import { site, absoluteUrl } from '@/shared/config/site';

export const dynamic = 'force-static';
function xml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
export function GET() {
  const items = getDocuments()
    .map(
      (doc) =>
        `<item><title>${xml(doc.title)}</title><link>${xml(absoluteUrl(doc.href))}</link><guid isPermaLink="true">${xml(absoluteUrl(doc.href))}</guid><description>${xml(doc.description)}</description>${doc.updated || doc.published ? `<pubDate>${new Date(doc.updated ?? doc.published!).toUTCString()}</pubDate>` : ''}${(doc.tags ?? []).map((tag) => `<category>${xml(tag)}</category>`).join('')}</item>`,
    )
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(site.name)}</title><link>${xml(site.url)}</link><description>${xml(site.description)}</description><language>ja</language>${items}</channel></rss>`,
    { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } },
  );
}
