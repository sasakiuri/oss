import { describe, expect, it } from 'vitest';

import { responsiveImageAttributes } from '@/lib/content/responsive-images';

describe('responsive content images', () => {
  it('uses optimized candidates up to the source width, with an original for zoom and print', () => {
    const result = responsiveImageAttributes('/content/articles/example/photo.jpg', 200, 150, true)!;
    expect(result.dataOriginalSrc).toBe('/content/articles/example/photo.jpg');
    expect(result.sizes).toMatch(/^auto, /);
    const candidates = result.srcSet.split(', ');
    expect(candidates.every((candidate) => candidate.startsWith('/_next/image'))).toBe(true);
    expect(candidates.at(-1)).toMatch(/256w$/);
    expect(result.srcSet).not.toContain('384w');
  });

  it('provides explicit reading widths for eager images', () => {
    const result = responsiveImageAttributes('/content/assets/diagram.png', 1440, 1080, false)!;
    expect(result.sizes).not.toMatch(/^auto/);
    expect(result.srcSet).toContain('1200w');
    expect(result.srcSet).not.toContain('2048w');
  });

  it('matches wide articles and caps news at its tablet reading width', () => {
    const article = responsiveImageAttributes('/content/assets/photo.jpg', 1440, 1080, false, 'article')!;
    const news = responsiveImageAttributes('/content/assets/photo.jpg', 1440, 1080, false, 'news')!;
    expect(article.sizes).toContain('(min-width: 1024px) 926px');
    expect(news.sizes).toContain('(min-width: 768px) 670px');
  });

  it.each([
    '/content/assets/animated.gif',
    '/content/assets/vector.svg',
    '/content/assets/photo.jpg?v=2',
    '/other/photo.png',
    'https://example.com/photo.jpg',
    '//example.com/photo.jpg',
    'data:image/png;base64,example',
  ])('leaves unsupported or external images unchanged: %s', (src) => {
    expect(responsiveImageAttributes(src, 200, 100, true)).toBeNull();
  });
});
