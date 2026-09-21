import { fileURLToPath } from 'node:url';

import { articleCategoryDefinitions } from '../lib/content/categories';

import { parseArticleOptions } from './article-options';
import { createContent } from './create-content';

try {
  const { help, ...options } = parseArticleOptions(process.argv.slice(2));
  if (help) {
    console.log('Usage: new:article -- "タイトル" [--category ID] [--tag タグ] [--tag タグ]');
    console.log('Categories (default: uncategorized):');
    for (const category of articleCategoryDefinitions) console.log(`  ${category.id}: ${category.title}`);
  } else {
    const { slug } = createContent({
      type: 'articles',
      contentRoot: fileURLToPath(new URL('../content/', import.meta.url)),
      ...options,
    });
    console.log(`Created: content/articles/${slug}/index.md`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
