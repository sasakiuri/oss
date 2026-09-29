// @vitest-environment node
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decodeContentAssetPathname, isPublishableContentPath } from '@/lib/content/asset-path';
import { serveContentAsset } from '@/lib/content/assets';
import { createImageDimensionsResolver } from '@/lib/content/images';
import { searchDocumentSchema } from '@/lib/content/schemas';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40"/></svg>';
const pdfDocument = (id: string) => ({ id, type: 'pdf', title: '', section: '', tags: [], text: '' });
let directory: string;
let contentRoot: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'knowledge-asset-path-'));
  contentRoot = path.join(directory, 'content');
  await mkdir(path.join(contentRoot, 'assets'), { recursive: true });
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('published content asset paths', () => {
  it.each(['ordinary', '素 材', 'literal%2Fname', '100%', '%2ehidden'])(
    'preserves a valid logical name across URL, HTTP, image and search boundaries: %s',
    async (stem) => {
      const segments = ['assets', `${stem}.svg`];
      const pathname = `/content/assets/${encodeURIComponent(stem)}.svg`;
      await writeFile(path.join(contentRoot, ...segments), svg);
      expect(isPublishableContentPath(segments)).toBe(true);
      expect(decodeContentAssetPathname(pathname)).toEqual(segments);
      expect(await createImageDimensionsResolver(contentRoot)(`${pathname}?v=1#image`)).toEqual({
        width: 80,
        height: 40,
      });
      const response = await serveContentAsset(new Request(`https://example.com${pathname}`), segments, contentRoot);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/svg+xml');
      expect(await response.text()).toBe(svg);
      expect(
        searchDocumentSchema.safeParse(pdfDocument(`/content/assets/${encodeURIComponent(stem)}.pdf#page=1`)).success,
      ).toBe(true);
    },
  );

  it.each(['.hidden', '.private/document'])(
    'rejects existing dot-prefixed names and directories consistently: %s',
    async (stem) => {
      const segments = ['assets', ...`${stem}.svg`.split('/')];
      const pathname = `/content/${segments.map(encodeURIComponent).join('/')}`;
      const filename = path.join(contentRoot, ...segments);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, svg);
      expect(isPublishableContentPath(segments)).toBe(false);
      expect(decodeContentAssetPathname(pathname)).toBeNull();
      const response = await serveContentAsset(new Request(`https://example.com${pathname}`), segments, contentRoot);
      expect(response.status).toBe(404);
      await expect(createImageDimensionsResolver(contentRoot)(pathname)).rejects.toThrow('use publishable segments');
      expect(searchDocumentSchema.safeParse(pdfDocument(`${pathname.replace(/\.svg$/, '.pdf')}#page=1`)).success).toBe(
        false,
      );
    },
  );

  it.each(['..', '%2e%2e', 'a%2Fb', 'a%5Cb', '%00', '%1f', '%7f', ''])(
    'rejects forbidden decoded segments without interpreting percent sequences twice: %s',
    async (part) => {
      const pathname = `/content/assets/${part}/document.pdf`;
      const segments = ['assets', decodeURIComponent(part), 'document.pdf'];
      expect(isPublishableContentPath(segments)).toBe(false);
      expect(decodeContentAssetPathname(pathname)).toBeNull();
      expect(searchDocumentSchema.safeParse(pdfDocument(`${pathname}#page=1`)).success).toBe(false);
      const response = await serveContentAsset(new Request(`https://example.com${pathname}`), segments, contentRoot);
      expect(response.status).toBe(404);
      await expect(createImageDimensionsResolver(contentRoot)(pathname)).rejects.toThrow('must stay within content');
    },
  );

  it('retains distinct malformed-URL, non-content and missing-image policies', async () => {
    expect(isPublishableContentPath([])).toBe(false);
    expect(decodeContentAssetPathname('/content/')).toBeNull();
    expect(decodeContentAssetPathname('/other/file.pdf')).toBeNull();
    expect(() => decodeContentAssetPathname('/content/assets/%broken.pdf')).toThrow(URIError);
    const dimensions = createImageDimensionsResolver(contentRoot);
    await expect(dimensions('/content/assets/%broken.svg')).rejects.toThrow('Invalid content image URL');
    expect(await dimensions('/content/assets/missing.svg')).toBeNull();
    expect(await dimensions('https://example.com/image.svg')).toBeNull();
  });

  it('keeps realpath confinement in the Node consumers rather than the browser schema', async () => {
    const outside = path.join(directory, 'private.svg');
    await writeFile(outside, svg);
    await symlink(outside, path.join(contentRoot, 'assets/escape.svg'));
    const pathname = '/content/assets/escape.svg';
    await expect(createImageDimensionsResolver(contentRoot)(pathname)).rejects.toThrow('symlink must stay within content');
    const response = await serveContentAsset(
      new Request(`https://example.com${pathname}`),
      ['assets', 'escape.svg'],
      contentRoot,
    );
    expect(response.status).toBe(404);
  });
});
