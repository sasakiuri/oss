# Authored responsive images

Raw HTML `img` and `picture > source` elements may provide `srcset` candidates.
Relative candidate URLs resolve from `content/<type>/<slug>/`, just like `src`.
For example, in `content/articles/example/index.md`:

```html
<picture>
  <source srcset="wide.webp 800w, wider.webp 1600w" sizes="100vw" type="image/webp" />
  <img src="fallback.jpg" srcset="small.jpg 1x, large.jpg 2x" alt="Example" />
</picture>
```

The renderer rewrites these relative URLs to `/content/articles/example/...`.
Width and density descriptors, `sizes`, `media`, and `type` retain their authored
values. Absolute, root-relative, protocol-relative, data, and fragment URLs are
not rebased. Relative query strings and fragments remain attached to their URL.

Candidate boundaries follow the [HTML Standard](https://html.spec.whatwg.org/multipage/images.html#parse-a-srcset-attribute),
not a comma split: commas may occur inside data URLs and ordinary URL paths or
queries. Without descriptors, leave whitespace after the candidate separator
(for example, `small.jpg, large.jpg`). The renderer preserves separators and
invalid descriptors; it does not replace the browser's validation or selection.

Authored candidates are not overwritten by generated Next.js image candidates.
Images without authored responsive attributes retain the existing automatic
responsive-image behavior. Original-image links still use the fallback image;
image selection is otherwise native to the browser, including print rendering.

Regression coverage includes token-boundary tests, Markdown rendering for both
collections, and browser `currentSrc` and image-decoding checks with locally
served fixture images. No production content or editorial metadata is changed.
