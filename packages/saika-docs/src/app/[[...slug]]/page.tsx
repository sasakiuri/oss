// SPDX-License-Identifier: MIT
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createNavigation } from '@/entities/document/navigation';
import { getDocument, getDocuments } from '@/entities/document/server/repository';
import { DocumentPage } from '@/features/reading/document-page';
import { pageMetadata } from '@/shared/config/metadata';
import { absoluteUrl } from '@/shared/config/site';
import { structuredData } from '@/shared/lib/structured-data';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export const dynamicParams = false;
export function generateStaticParams() {
  return getDocuments().map((document) => ({ slug: document.slug }));
}
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const document = getDocument((await params).slug ?? []);
  return document ? pageMetadata(document.title, document.description, document.href) : {};
}

export default async function Page({ params }: PageProps) {
  const document = getDocument((await params).slug ?? []);
  if (!document) notFound();
  const documents = getDocuments();
  const order = createNavigation(documents).flatMap((group) => group.items.map((item) => item.href));
  const index = order.indexOf(document.href);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: structuredData({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Saika Docs', item: absoluteUrl('/') },
              ...(document.href === '/'
                ? []
                : [{ '@type': 'ListItem', position: 2, name: document.title, item: absoluteUrl(document.href) }]),
            ],
          }),
        }}
      />
      <DocumentPage
        document={document}
        previous={documents.find((doc) => doc.href === order[index - 1])}
        next={documents.find((doc) => doc.href === order[index + 1])}
      />
    </>
  );
}
