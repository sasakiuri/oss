import { fileURLToPath } from 'node:url';

import { createContent } from './create-content';

const { slug } = createContent({
  type: 'news',
  contentRoot: fileURLToPath(new URL('../content/', import.meta.url)),
  title: process.argv[2],
});

console.log(`Created: content/news/${slug}/index.md`);
