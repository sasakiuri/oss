// @vitest-environment node
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pdfExtractionKey, readPdfExtraction, writePdfExtraction } from '@/lib/content/pdf-extraction-cache';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'pdf-cache-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const bytes = new Uint8Array([1, 2, 3]);
const extraction = { pages: ['sample', ''], pagesWithoutText: [2] };

describe('content-addressed extraction records', () => {
  it('keys all extractor and content inputs without including reference metadata', () => {
    const key = pdfExtractionKey(bytes, '1', 'config-1');
    expect(pdfExtractionKey(bytes, '1', 'config-1')).toBe(key);
    expect(pdfExtractionKey(bytes, '2', 'config-1')).not.toBe(key);
    expect(pdfExtractionKey(bytes, '1', 'config-2')).not.toBe(key);
    expect(pdfExtractionKey(new Uint8Array([1, 2, 4]), '1', 'config-1')).not.toBe(key);
  });

  it('writes atomically for concurrent equivalent writers and leaves no temporary files', async () => {
    const key = pdfExtractionKey(bytes, '1');
    await Promise.all(Array.from({ length: 5 }, () => writePdfExtraction(directory, key, extraction)));
    expect(await readPdfExtraction(directory, key)).toEqual(extraction);
    expect(await readdir(directory)).toEqual([`${key}.json`]);
  });

  it('rejects incompatible records and inconsistent diagnostics as misses', async () => {
    const key = pdfExtractionKey(bytes, '1');
    for (const record of [
      { key: 'wrong', extraction },
      { key, extraction: { ...extraction, pagesWithoutText: [] } },
      { key, extraction, extra: true },
    ]) {
      await writeFile(path.join(directory, `${key}.json`), JSON.stringify(record));
      expect(await readPdfExtraction(directory, key)).toBeUndefined();
    }
  });
});
