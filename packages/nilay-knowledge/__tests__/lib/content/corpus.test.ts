import path from 'node:path';

import { expect, it } from 'vitest';

import { renderContent } from '@/lib/content/render';
import { createContentRepository } from '@/lib/content/repository';

it('renders every committed article with a valid target for every TOC link', async () => {
  const repository = createContentRepository(path.join(process.cwd(), 'content'));
  const articles = await repository.listSources('articles');
  expect(articles.length).toBeGreaterThan(0);
  let checkedHeadings = 0;
  for (const article of articles) {
    const rendered = await renderContent(article);
    const document = new DOMParser().parseFromString(rendered.html, 'text/html');
    for (const item of rendered.tableOfContents) {
      expect(document.getElementById(item.id)?.tagName, `${article.slug}: ${item.id}`).toBe(`H${item.level}`);
      checkedHeadings++;
    }
  }
  expect(checkedHeadings).toBeGreaterThan(0);
});
