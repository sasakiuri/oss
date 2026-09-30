import { z } from 'zod';

import { decodeContentAssetPathname } from './asset-path';

const text = z.string().trim().min(1);
const date = z.iso.date();

export function isCanonicalPdfUrl(value: string): boolean {
  try {
    const segments = decodeContentAssetPathname(value);
    return (
      segments !== null && /\.pdf$/i.test(value) && `/content/${segments.map(encodeURIComponent).join('/')}` === value
    );
  } catch {
    return false;
  }
}

const pdfUrl = z.string().refine(isCanonicalPdfUrl, 'A canonical published PDF URL without a query or fragment');
const articleUrl = z.string().regex(/^\/(?:articles|news)\/[a-zA-Z0-9][a-zA-Z0-9_-]*\/$/);

const revisionFields = {
  status: z.enum(['unverified', 'current', 'historical', 'superseded']),
  region: text.optional(),
  scope: text.optional(),
  checked: date.optional(),
  sources: z
    .array(
      z
        .object({
          title: text,
          url: z.url().refine((value) => {
            const url = new URL(value);
            return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
          }, 'An HTTP or HTTPS URL without credentials'),
        })
        .strict(),
    )
    .min(1)
    .optional(),
  successor: pdfUrl.optional(),
};

function validateCurrent(
  record: { status: string; region?: string; scope?: string; checked?: string; sources?: unknown[] },
  context: z.RefinementCtx,
) {
  if (record.status === 'current') {
    for (const field of ['region', 'scope', 'checked', 'sources'] as const) {
      if (record[field] === undefined)
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Reviewed current PDFs require explicit scope, region, date and source evidence',
        });
    }
  }
}

export const pdfRevisionSchema = z.object(revisionFields).strict().superRefine(validateCurrent);
export const pdfSearchMetadataSchema = z
  .object({
    ...revisionFields,
    references: z.array(z.object({ title: text, url: articleUrl }).strict()).min(1),
  })
  .strict()
  .superRefine(validateCurrent)
  .superRefine((record, context) => {
    if (new Set(record.references.map((reference) => reference.url)).size !== record.references.length) {
      context.addIssue({ code: 'custom', path: ['references'], message: 'Duplicate referring article' });
    }
  });

export type PdfRevision = z.infer<typeof pdfRevisionSchema>;
export type PdfSearchMetadata = z.infer<typeof pdfSearchMetadataSchema>;

export const pdfRegistrySchema = z.record(pdfUrl, pdfRevisionSchema).superRefine((records, context) => {
  for (const url of Object.keys(records)) {
    const visited = new Set<string>([url]);
    let successor = records[url]?.successor;
    while (successor) {
      if (visited.has(successor)) {
        context.addIssue({
          code: 'custom',
          path: [url, 'successor'],
          message: 'PDF successors must not refer to themselves or form cycles',
        });
        break;
      }
      visited.add(successor);
      successor = records[successor]?.successor;
    }
  }
});
