import { describe, expect, it } from 'vitest';

import { renderContent } from '@/lib/content/render';
import { resolveContentSrcSet } from '@/lib/content/srcset';

const prefix = '/content/articles/example/';

describe('authored srcset URLs', () => {
  it.each([
    ['', ''],
    [' ,\t\r\n\f,, ', ' ,\t\r\n\f,, '],
    ['wide.webp', `${prefix}wide.webp`],
    ['a.webp 1x, b.webp 2x', `${prefix}a.webp 1x, ${prefix}b.webp 2x`],
    ['a.webp, b.webp', `${prefix}a.webp, ${prefix}b.webp`],
    ['a.webp,b.webp', `${prefix}a.webp,b.webp`],
    [
      'data:image/svg+xml,%3Csvg%3E,%3C/svg%3E 1x, b.webp 2x',
      `data:image/svg+xml,%3Csvg%3E,%3C/svg%3E 1x, ${prefix}b.webp 2x`,
    ],
    ['data:image/png;base64,AAAA, b.webp 2x', `data:image/png;base64,AAAA, ${prefix}b.webp 2x`],
    [
      '../shared/a.webp?q=a,b#f 300w, ../../assets/b.webp 600w',
      '/content/articles/shared/a.webp?q=a,b#f 300w, /content/assets/b.webp 600w',
    ],
    [
      '/a.webp 1x, //images.example/b.webp 2x, https://images.example/c.webp 3x',
      '/a.webp 1x, //images.example/b.webp 2x, https://images.example/c.webp 3x',
    ],
    ['#fragment 1x, ?size=2#x 2x', `#fragment 1x, ${prefix}?size=2#x 2x`],
    ['a.webp future(a,b) 1x, b.webp 2x', `${prefix}a.webp future(a,b) 1x, ${prefix}b.webp 2x`],
    ['a.webp invalid(foo,bar', `${prefix}a.webp invalid(foo,bar`],
    [' , a.webp,,\t b.webp 2x, ', ` , ${prefix}a.webp,,\t ${prefix}b.webp 2x, `],
    ['a.webp\u00a0b.webp 1x', `${prefix}a.webp%C2%A0b.webp 1x`],
  ])('resolves only URL tokens in %j', (input, expected) => {
    expect(resolveContentSrcSet(input, 'articles', 'example')).toBe(expected);
    expect(resolveContentSrcSet(expected, 'articles', 'example')).toBe(expected);
  });

  it.each(['articles', 'news'] as const)('uses the %s asset directory for img and picture candidates', async (type) => {
    const { html } = await renderContent(
      {
        type,
        slug: 'example',
        frontmatter: { title: 'Example', published: '2024-01-01', tags: [] },
        content: [
          '<img alt="Density" src="fallback.png" srcset="small.png 1x, large.png 2x" sizes="50vw">',
          '<picture><source srcset="wide.webp?size=1#crop 400w, wider.webp 800w"',
          ' sizes="100vw" media="(min-width: 1px)" type="image/webp">',
          '<img alt="Picture" src="picture.png"></picture>',
          '<div data-example="small.png 1x, large.png 2x">Example</div>',
          '',
          '`<img srcset="code.png 1x">`',
        ].join('\n'),
      },
      { imageDimensions: async () => ({ width: 800, height: 600 }) },
    );
    document.body.innerHTML = html;
    const base = `/content/${type}/example/`;
    expect(document.querySelector('img')).toHaveAttribute('srcset', `${base}small.png 1x, ${base}large.png 2x`);
    expect(document.querySelector('img')).toHaveAttribute('sizes', '50vw');
    expect(document.querySelector('source')).toHaveAttribute(
      'srcset',
      `${base}wide.webp?size=1#crop 400w, ${base}wider.webp 800w`,
    );
    expect(document.querySelector('source')).toHaveAttribute('sizes', '100vw');
    expect(document.querySelector('source')).toHaveAttribute('media', '(min-width: 1px)');
    expect(document.querySelector('source')).toHaveAttribute('type', 'image/webp');
    expect(document.querySelector('picture img')).not.toHaveAttribute('srcset');
    expect(document.querySelector('picture img')).toHaveAttribute('src', `${base}picture.png`);
    expect(document.querySelector('[data-image-zoom]')).toHaveAttribute('href', `${base}fallback.png`);
    expect(document.querySelector('[data-example]')).toHaveAttribute('data-example', 'small.png 1x, large.png 2x');
    expect(document.querySelector('code')).toHaveTextContent('<img srcset="code.png 1x">');
  });
});
