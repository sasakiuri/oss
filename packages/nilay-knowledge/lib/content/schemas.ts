import { z } from 'zod';

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

export const frontmatterSchema = z.object(
  {
    title: nonEmptyText,
    published: publicationDate,
    tags: z.array(nonEmptyText),
    updated: publicationDate.optional(),
    image: nonEmptyText.optional(),
  },
  { error: 'a mapping' },
);

export const searchDocumentSchema = z
  .object({
    id: z.string(),
    type: z.enum(contentTypes),
    title: z.string(),
    section: z.string(),
    tags: z.array(z.string()),
    text: z.string(),
  })
  .refine((document) => new RegExp(`^/${document.type}/[a-zA-Z0-9][a-zA-Z0-9_-]*/(?:#[^\\s#]+)?$`).test(document.id), {
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
