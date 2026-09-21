// @vitest-environment node
import * as fs from 'node:fs/promises';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createImageDimensionsResolver } from '@/lib/content/images';

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));

let directory: string;
let publicContent: string;
let imageDimensions: ReturnType<typeof createImageDimensionsResolver>;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nilay-images-'));
  publicContent = path.join(directory, 'public', 'content');
  await mkdir(path.join(publicContent, 'assets'), { recursive: true });
  imageDimensions = createImageDimensionsResolver(publicContent);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

function fixture(width = 80, height = 40) {
  return sharp({ create: { width, height, channels: 3, background: '#123456' } });
}

describe('published image dimensions', () => {
  it('reads intrinsic dimensions from encoded asset paths and ignores query strings and fragments', async () => {
    await fixture()
      .png()
      .toFile(path.join(publicContent, 'assets', '鳥 の画像.png'));
    expect(await imageDimensions('/content/assets/%E9%B3%A5%20%E3%81%AE%E7%94%BB%E5%83%8F.png?v=1#image')).toEqual({
      width: 80,
      height: 40,
    });
  });

  it('uses the orientation displayed by browsers for JPEG dimensions', async () => {
    await fixture()
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(path.join(publicContent, 'assets', 'rotated.jpg'));
    expect(await imageDimensions('/content/assets/rotated.jpg')).toEqual({ width: 40, height: 80 });
  });

  it('supports SVG assets without rasterizing them', async () => {
    await writeFile(
      path.join(publicContent, 'assets', 'drawing.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60"/></svg>',
    );
    expect(await imageDimensions('/content/assets/drawing.svg')).toEqual({ width: 120, height: 60 });
  });

  it('leaves remote URLs, other public paths and missing content assets to the browser', async () => {
    for (const src of [
      'https://example.com/content/image.png',
      '//example.com/content/image.png',
      'data:image/png;base64,example',
      '/image.png',
      '/content/assets/missing.png',
      '/content/missing/nested/image.png',
    ]) {
      expect(await imageDimensions(src)).toBeNull();
    }
  });

  it.each([
    '/content/../outside.png',
    '/content/assets/%2e%2e/%2e%2e/outside.png',
    '/content/assets/%2e%2e%2f%2e%2e%2foutside.png',
    '/content/assets/..\\outside.png',
    '/content/assets/%00.png',
    '/content/',
  ])('rejects unsafe content paths before reading a file: %s', async (src) => {
    await expect(imageDimensions(src)).rejects.toThrow('must stay within public/content');
  });

  it('rejects malformed URL encoding and symlinks that escape the content directory', async () => {
    await expect(imageDimensions('/content/assets/%broken.png')).rejects.toThrow('Invalid content image URL');
    const outside = path.join(directory, 'outside.png');
    await fixture().png().toFile(outside);
    await symlink(outside, path.join(publicContent, 'assets', 'link.png'));
    await expect(imageDimensions('/content/assets/link.png')).rejects.toThrow(
      'symlink must stay within public/content',
    );
  });

  it('reports corrupt files and invalid filesystem paths instead of silently omitting dimensions', async () => {
    await writeFile(path.join(publicContent, 'assets', 'broken.png'), 'not an image');
    await expect(imageDimensions('/content/assets/broken.png')).rejects.toThrow('Unable to read content image');
    await expect(imageDimensions('/content/assets')).rejects.toThrow('must be a regular file');
    for (const src of ['/content/assets/broken.png/image.png', '/content/assets/broken.png/nested/image.png']) {
      await expect(imageDimensions(src)).rejects.toThrow('Content image parent must be a directory');
    }
  });

  it.each(['ENOENT', 'ENOTDIR'])('rejects file traversal when realpath reports %s', async (code) => {
    await writeFile(path.join(publicContent, 'assets', 'file'), 'not a directory');
    const target = path.join(publicContent, 'assets', 'file', 'nested', 'image.png');
    const realpath = fs.realpath;
    vi.spyOn(fs, 'realpath').mockImplementation((filename, options) =>
      filename === target
        ? Promise.reject(Object.assign(new Error('Unable to resolve path'), { code }))
        : realpath(filename, options),
    );

    await expect(imageDimensions('/content/assets/file/nested/image.png')).rejects.toThrow(
      'Content image parent must be a directory',
    );
  });

  it('observes asset changes between renders instead of retaining stale dimensions', async () => {
    const filename = path.join(publicContent, 'assets', 'updated.png');
    await fixture().png().toFile(filename);
    expect(await imageDimensions('/content/assets/updated.png')).toEqual({ width: 80, height: 40 });
    await fixture(100, 25).png().toFile(filename);
    expect(await imageDimensions('/content/assets/updated.png')).toEqual({ width: 100, height: 25 });
  });
});
