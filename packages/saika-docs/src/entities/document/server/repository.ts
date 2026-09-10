// SPDX-License-Identifier: MIT
import 'server-only';

import records from '../../../../.generated/documents.json';
import type { DocumentRecord, SearchDocument } from '../model';

export function getDocuments(): DocumentRecord[] {
  return records;
}

export function getDocument(slug: string[]): DocumentRecord | undefined {
  return getDocuments().find((document) => document.slug.join('/') === slug.join('/'));
}

export function getSearchDocuments(): SearchDocument[] {
  return getDocuments().flatMap((document) => [
    { id: document.href, title: document.title, section: '', text: document.text },
    ...document.headings.map((heading) => ({
      id: `${document.href}#${heading.id}`,
      title: document.title,
      section: heading.text,
      text: '',
    })),
  ]);
}
