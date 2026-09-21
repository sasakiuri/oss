import { getImageProps } from 'next/image';

export function responsiveImageAttributes(
  src: string,
  width: number,
  height: number,
  lazy: boolean,
  layout: 'article' | 'article-with-toc' | 'news' = 'article-with-toc',
) {
  // Keep SVG, animated formats, external sources and authored picture/srcset elements untouched.
  if (!/^\/content\/[^?#]+\.(?:png|jpe?g|webp)$/i.test(src)) return null;
  const { props } = getImageProps({ src, alt: '', width, height, sizes: 'auto' });
  const candidates = (props.srcSet ?? '').split(', ').filter((candidate) => {
    const candidateWidth = Number(candidate.split(' ').at(-1)?.replace('w', ''));
    return candidateWidth >= Math.min(128, width);
  });
  const limit = candidates.findIndex((candidate) => Number(candidate.split(' ').at(-1)?.replace('w', '')) >= width);
  const columnWidth = layout === 'news' ? 670 : layout === 'article' ? 926 : 638;
  const newsWidth = layout === 'news' ? '(min-width: 768px) 670px, ' : '';
  const readingSizes = `(min-width: 1024px) ${columnWidth}px, ${newsWidth}(min-width: 640px) calc(100vw - 98px), calc(100vw - 74px)`;
  return {
    srcSet: (limit < 0 ? candidates : candidates.slice(0, limit + 1)).join(', '),
    sizes: lazy ? `auto, ${readingSizes}` : readingSizes,
    // Display responsive versions while zoom and print retain the unmodified original.
    dataOriginalSrc: src,
  };
}
