import fs from 'node:fs';
import path from 'node:path';

import { parseFrontmatter } from '../lib/content/frontmatter';

interface CreateContentOptions {
  type: 'articles' | 'news';
  contentRoot: string;
  title?: string;
  category?: string;
  tags?: string[];
  now?: Date;
}

export function createContent({
  type,
  contentRoot,
  title,
  category,
  tags = [],
  now = new Date(),
}: CreateContentOptions) {
  const published = now.toISOString();
  const label = type === 'articles' ? '記事' : 'ニュース';
  if (type === 'news' && category !== undefined) throw new Error('Categories are only supported for articles.');
  const metadata = parseFrontmatter(
    {
      title: title || `新しい${label}`,
      published,
      tags,
      ...(type === 'articles' ? { category: category ?? 'uncategorized' } : {}),
    },
    `new ${type}`,
  );
  const baseSlug =
    type === 'articles'
      ? Math.floor(now.getTime() / 1000).toString()
      : `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  const collectionDirectory = path.join(contentRoot, type);
  fs.mkdirSync(collectionDirectory, { recursive: true });

  let suffix = 0;
  let slug: string;
  let directory: string;
  while (true) {
    slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`;
    directory = path.join(collectionDirectory, slug);
    try {
      // Reserve the slug atomically so simultaneous invocations cannot overwrite one another.
      fs.mkdirSync(directory);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      suffix++;
    }
  }

  const content = `---
title: ${JSON.stringify(metadata.title)}
published: ${JSON.stringify(published)}
tags: ${JSON.stringify(metadata.tags)}
${metadata.category ? `category: ${metadata.category}\n` : ''}---

ここに${label}の内容を書いてください。
`;
  const filePath = path.join(directory, 'index.md');
  fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
  return { slug, filePath };
}
