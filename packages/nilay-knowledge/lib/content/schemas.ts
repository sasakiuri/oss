import { z } from 'zod';

import { articleCategoryTitles } from './categories';
import { contentTypes } from './types';

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
      image: nonEmptyText.optional(),
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
      url.pathname
        .split('/')
        .slice(1)
        .every((part) => {
          const decoded = decodeURIComponent(part);
          return decoded !== '.' && decoded !== '..' && !/[\\/\u0000-\u001f\u007f]/.test(decoded);
        })
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
  })
  .refine(isSearchDestination, {
    path: ['id'],
    error: 'Invalid search destination',
  });

export const searchDocumentsSchema = z
  .array(searchDocumentSchema.catchall(z.unknown()))
  .superRefine((documents, ctx) => {
    const ids = new Set<string>();
    for (const [index, document] of documents.entries()) {
      if (ids.has(document.id)) {
        ctx.addIssue({ code: 'custom', path: [index, 'id'], message: 'Duplicate search destination' });
      }
      ids.add(document.id);
    }
  });
