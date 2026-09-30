import { z } from 'zod';

import { decodeContentAssetPathname } from './asset-path';
import { articleCategoryTitles } from './categories';
import { isMetadataImage } from './metadata-image';
import { contentTypes } from './types';
import { pdfSearchMetadataSchema } from './pdf-metadata';

const nonEmptyText = z
  .string({ error: 'a non-empty string' })
  .refine((value) => value.trim().length > 0, { error: 'a non-empty string' });

const publicationDate = nonEmptyText
  .pipe(
    z
      .string()
      .refine(
        (value) =>
          /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(
            value,
          ) && Number.isFinite(Date.parse(value)),
        { error: 'an ISO date or timestamp with a timezone', abort: true },
      ),
  )
  .refine(
    // Date.parse normalizes impossible dates such as February 30.
    (value) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) === value.slice(0, 10),
    { error: 'a valid calendar date' },
  );

export const frontmatterSchema = z
  .object(
    {
      title: nonEmptyText,
      description: nonEmptyText.optional(),
      published: publicationDate,
      tags: z.array(nonEmptyText).transform((tags) => [...new Set(tags.map((tag) => tag.trim()))]),
      category: z.enum(Object.keys(articleCategoryTitles) as (keyof typeof articleCategoryTitles)[]).optional(),
      updated: publicationDate.optional(),
      image: nonEmptyText
        .refine(isMetadataImage, { error: 'a published content image path or HTTP(S) URL' })
        .optional(),
      review: z
        .object({
          checked: publicationDate,
          region: nonEmptyText,
          scope: nonEmptyText,
          sources: z
            .array(
              z
                .object({
                  title: nonEmptyText,
                  url: z.url().refine(
                    (value) => {
                      if (!URL.canParse(value)) return false;
                      const url = new URL(value);
                      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
                    },
                    { error: 'an HTTP or HTTPS URL without credentials' },
                  ),
                })
                .strict(),
            )
            .min(1),
        })
        .strict()
        .optional(),
    },
    { error: 'a mapping' },
  )
  .refine(({ published, updated }) => updated === undefined || Date.parse(updated) >= Date.parse(published), {
    path: ['updated'],
    error: 'on or after published',
  });

function isSearchDestination(document: { id: string; type: string }): boolean {
  if (document.type !== 'pdf') {
    return new RegExp(`^/${document.type}/[a-zA-Z0-9][a-zA-Z0-9_-]*/(?:#[^\\s#]+)?$`).test(document.id);
  }
  try {
    const url = new URL(document.id, 'https://content.invalid');
    return (
      url.origin === 'https://content.invalid' &&
      !url.search &&
      url.pathname + url.hash === document.id &&
      /^\/content\/(?:(?:articles|news)\/[a-zA-Z0-9][a-zA-Z0-9_-]*\/|assets\/).+\.pdf$/i.test(url.pathname) &&
      /^#page=[1-9]\d*$/.test(url.hash) &&
      decodeContentAssetPathname(url.pathname) !== null
    );
  } catch {
    return false;
  }
}

export const searchDocumentSchema = z
  .object({
    id: z.string(),
    type: z.enum([...contentTypes, 'pdf']),
    title: z.string(),
    section: z.string(),
    tags: z.array(z.string()),
    text: z.string(),
    pdf: pdfSearchMetadataSchema.optional(),
  })
  .refine(isSearchDestination, {
    path: ['id'],
    error: 'Invalid search destination',
  })
  .refine((document) => document.pdf === undefined || document.type === 'pdf', {
    path: ['pdf'],
    error: 'PDF metadata belongs to PDF documents',
  });

export const searchDocumentsSchema = z
  .array(searchDocumentSchema.catchall(z.unknown()))
  .superRefine((documents, ctx) => {
    const ids = new Set<string>();
    const metadata = new Set<string>();
    for (const [index, document] of documents.entries()) {
      if (ids.has(document.id)) {
        ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate search destination' });
      }
      ids.add(document.id);
      if (document.pdf) {
        const url = document.id.split('#')[0]!;
        if (metadata.has(url))
          ctx.addIssue({ code: 'custom', path: [index, 'pdf'], message: 'Duplicate PDF metadata' });
        if (document.pdf.successor === url)
          ctx.addIssue({
            code: 'custom',
            path: [index, 'pdf', 'successor'],
            message: 'PDF successor must not refer to itself',
          });
        metadata.add(url);
      }
    }
  });
