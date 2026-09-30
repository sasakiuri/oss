import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

/** Bump for changes to normalization, PDF.js settings, or its shipped font/CMap inputs. */
export const pdfExtractionVersion = '1';

const extractionSchema = z
  .object({
    pages: z.array(z.string()).min(1),
    pagesWithoutText: z.array(z.number().int().positive()),
  })
  .strict()
  .superRefine((record, context) => {
    const blank = record.pages.flatMap((text, index) => (text === '' ? [index + 1] : []));
    if (JSON.stringify(blank) !== JSON.stringify(record.pagesWithoutText)) {
      context.addIssue({ code: 'custom', message: 'Inconsistent extraction diagnostics' });
    }
  });
export type PdfExtraction = z.infer<typeof extractionSchema>;
const recordSchema = z.object({ key: z.string().regex(/^[a-f0-9]{64}$/), extraction: extractionSchema }).strict();

export function pdfExtractionKey(
  bytes: Uint8Array,
  pdfjsVersion: string,
  extractionVersion = pdfExtractionVersion,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ pdfjsVersion, extractionVersion }))
    .update('\0')
    .update(bytes)
    .digest('hex');
}

/** Resolve existing ancestors so cache symlinks cannot publish extraction records as content assets. */
export async function resolvePdfCacheDirectory(requested: string, contentDirectory: string): Promise<string | false> {
  let existing = path.resolve(requested);
  const suffix: string[] = [];
  while (true) {
    try {
      const resolved = path.join(await realpath(existing), ...suffix);
      const relative = path.relative(contentDirectory, resolved);
      if (relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))
        return false;
      return resolved;
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) return false;
      const parent = path.dirname(existing);
      if (parent === existing) return false;
      suffix.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

export async function readPdfExtraction(directory: string | false, key: string): Promise<PdfExtraction | undefined> {
  if (!directory) return undefined;
  try {
    const record = recordSchema.parse(JSON.parse(await readFile(path.join(directory, `${key}.json`), 'utf8')));
    return record.key === key ? record.extraction : undefined;
  } catch {
    return undefined;
  }
}

/** Equivalent same-key concurrent writers may replace one another; readers only see complete records. */
export async function writePdfExtraction(
  directory: string | false,
  key: string,
  extraction: PdfExtraction,
): Promise<void> {
  if (!directory) return;
  const temporary = path.join(directory, `.${key}.${randomUUID()}.tmp`);
  try {
    const record = recordSchema.parse({ key, extraction });
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, JSON.stringify(record), { flag: 'wx' });
    await rename(temporary, path.join(directory, `${key}.json`));
  } catch {
    // Caching is optional. A filesystem failure must not prevent a correct index build.
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
