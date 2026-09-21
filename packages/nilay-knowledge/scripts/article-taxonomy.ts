import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { articleCategoryDefinitions } from '../lib/content/categories';
import { createContentRepository } from '../lib/content/repository';
import { createArticleDirectory, getArticleTags } from '../lib/content/taxonomy';
import { contentTypes, type ContentSummary } from '../lib/content/types';

export function formatTaxonomyReport(content: ContentSummary[]): string {
  const articles = createArticleDirectory(content);
  const lines = [`記事: ${articles.length}件`, '', 'カテゴリー（ID / 名前 / 件数）'];
  for (const category of articleCategoryDefinitions) {
    lines.push(
      `${category.id} / ${category.title} / ${articles.filter((article) => article.category.id === category.id).length}件`,
    );
  }
  lines.push('', 'タグ（名前 / 件数）');
  for (const tag of getArticleTags(articles)) {
    lines.push(`${tag} / ${articles.filter((article) => article.frontmatter.tags.includes(tag)).length}件`);
  }
  for (const [label, matches] of [
    ['未分類の記事', articles.filter((article) => article.category.id === 'uncategorized')],
    ['タグなしの記事', articles.filter((article) => article.frontmatter.tags.length === 0)],
  ] as const) {
    lines.push('', `${label}: ${matches.length}件`);
    for (const article of matches) lines.push(`  ${article.slug}: ${article.frontmatter.title}`);
  }
  return lines.join('\n');
}

async function main() {
  const { values } = parseArgs({ options: { check: { type: 'boolean' } } });
  const repository = createContentRepository(fileURLToPath(new URL('../content/', import.meta.url)));
  const content = (await Promise.all(contentTypes.map((type) => repository.list(type)))).flat();
  console.log(values.check ? `Validated metadata for ${content.length} entries.` : formatTaxonomyReport(content));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
