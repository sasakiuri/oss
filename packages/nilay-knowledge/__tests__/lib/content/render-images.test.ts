import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createImageDimensionsResolver } from '@/lib/content/images';
import { renderContent } from '@/lib/content/render';
import { createContentRepository } from '@/lib/content/repository';
import type { ContentSource } from '@/lib/content/types';

function source(content: string): ContentSource {
  return {
    type: 'articles',
    slug: 'example',
    frontmatter: { title: 'Example', published: '2024-01-01', tags: [] },
    content,
  };
}

describe('article image rendering', () => {
  it('loads the first image eagerly and defers subsequent images while preserving author choices', async () => {
    document.body.innerHTML = (
      await renderContent(
        source(`
![First](first.png)
![Second](second.png)
<img src="third.png" loading="eager" decoding="sync" alt="Authored">
`),
      )
    ).html;
    const images = [...document.querySelectorAll('img')];
    expect(images.map((image) => image.getAttribute('loading'))).toEqual(['eager', 'lazy', 'eager']);
    expect(images.map((image) => image.getAttribute('decoding'))).toEqual(['async', 'async', 'sync']);
    expect(images.every((image) => !image.hasAttribute('width') && !image.hasAttribute('height'))).toBe(true);

    const authoredFirst = await renderContent(source('<img src="first.png" loading="lazy" decoding="auto">'));
    document.body.innerHTML = authoredFirst.html;
    expect(document.querySelector('img')).toHaveAttribute('loading', 'lazy');
    expect(document.querySelector('img')).toHaveAttribute('decoding', 'auto');
  });

  it('reserves image space, respects one or both author dimensions and shares repeated reads within a render', async () => {
    const imageDimensions = vi.fn().mockResolvedValue({ width: 1200, height: 800 });
    document.body.innerHTML = (
      await renderContent(
        source(`
![Natural](image.png)
<img src="image.png" width="300" alt="Width">
<img src="image.png" height="100" alt="Height">
<img src="custom.png" width="50" height="70" alt="Both">
`),
        { imageDimensions },
      )
    ).html;
    const images = [...document.querySelectorAll('img')];
    expect(images.map((image) => [image.getAttribute('width'), image.getAttribute('height')])).toEqual([
      ['1200', '800'],
      ['300', '200'],
      ['150', '100'],
      ['50', '70'],
    ]);
    expect(imageDimensions).toHaveBeenCalledWith('/content/articles/example/image.png');
    expect(imageDimensions).toHaveBeenCalledTimes(2);
    expect(images[0]).toHaveAttribute('src', '/content/articles/example/image.png');

    await renderContent(source('![Natural](image.png)'), { imageDimensions });
    expect(imageDimensions).toHaveBeenCalledTimes(3);
  });

  it('preserves authored responsive images and picture sources', async () => {
    const imageDimensions = vi.fn().mockResolvedValue({ width: 1200, height: 800 });
    document.body.innerHTML = (
      await renderContent(
        source(`
<img src="photo.jpg" srcset="authored.jpg 2x" sizes="50vw" alt="Authored">
<picture><source srcset="wide.webp" media="(min-width: 800px)"><img src="photo.jpg" alt="Art direction"></picture>

![Responsive](photo.jpg)
`),
        { imageDimensions },
      )
    ).html;
    const images = [...document.querySelectorAll('img')];
    expect(images[0]).toHaveAttribute('srcset', 'authored.jpg 2x');
    expect(images[0]).toHaveAttribute('sizes', '50vw');
    expect(images[1]).not.toHaveAttribute('srcset');
    expect(images[2]).toHaveAttribute('srcset', expect.stringContaining('/_next/image'));
    expect(images[2]).toHaveAttribute('data-original-src', '/content/articles/example/photo.jpg');
  });

  it('preserves missing image dimensions and reports asset failures', async () => {
    const imageDimensions = vi.fn().mockResolvedValue(null);
    document.body.innerHTML = (await renderContent(source('![Missing](missing.png)'), { imageDimensions })).html;
    expect(document.querySelector('img')).not.toHaveAttribute('width');
    expect(document.querySelector('img')).not.toHaveAttribute('height');
    imageDimensions.mockRejectedValue(new Error('Corrupt content image'));
    await expect(renderContent(source('![Broken](broken.png)'), { imageDimensions })).rejects.toThrow(
      'Corrupt content image',
    );
  });

  it('gives all field-guide images dimensions without changing original assets or heading destinations', async () => {
    const repository = createContentRepository(path.join(process.cwd(), 'content'));
    const article = (await repository.read('articles', '1403693668'))!;
    const plain = await renderContent(article);
    const rendered = await renderContent(article, {
      imageDimensions: createImageDimensionsResolver(path.join(process.cwd(), 'public', 'content')),
    });
    const plainDocument = new DOMParser().parseFromString(plain.html, 'text/html');
    const renderedDocument = new DOMParser().parseFromString(rendered.html, 'text/html');
    const images = [...renderedDocument.querySelectorAll('img')];
    expect(images).toHaveLength(94);
    expect(images.every((image) => image.width > 0 && image.height > 0)).toBe(true);
    expect(images[0]?.getAttribute('loading')).toBe('eager');
    expect(images.slice(1).every((image) => image.getAttribute('loading') === 'lazy')).toBe(true);
    expect(images.every((image) => image.getAttribute('decoding') === 'async')).toBe(true);
    expect(images.map((image) => image.getAttribute('src'))).toEqual(
      [...plainDocument.querySelectorAll('img')].map((image) => image.getAttribute('src')),
    );
    expect(rendered.tableOfContents).toEqual(plain.tableOfContents);
    for (const heading of rendered.tableOfContents) {
      expect(renderedDocument.getElementById(heading.id)?.tagName).toBe(`H${heading.level}`);
    }
  });
});
