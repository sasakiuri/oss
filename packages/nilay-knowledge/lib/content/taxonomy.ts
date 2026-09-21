import { articleCategoryDefinitions, articleCategoryTitles, type ArticleCategory } from './categories';
import { articleReadingOrder } from './navigation';
import type { ContentSummary } from './types';

export interface DirectoryArticle extends ContentSummary {
  category: ArticleCategory;
  description?: string;
}

export interface ArticleFilters {
  category: string;
  tags: string[];
}

export const uncategorized: ArticleCategory = { id: 'uncategorized', title: articleCategoryTitles.uncategorized };

export function getArticleCategory(article: ContentSummary): ArticleCategory {
  const id = article.frontmatter.category ?? uncategorized.id;
  return { id, title: articleCategoryTitles[id] };
}

/** Classification comes from frontmatter; the editorial index supplies descriptions and reading order. */
export function createArticleDirectory(content: ContentSummary[]): DirectoryArticle[] {
  const curated = articleReadingOrder;
  const order = new Map(curated.map((article, index) => [article.slug, index]));
  return content
    .filter((article) => article.type === 'articles')
    .map((article) => ({
      ...article,
      category: getArticleCategory(article),
      description:
        article.frontmatter.description ??
        curated.find((entry) => entry.slug === `articles/${article.slug}`)?.description,
    }))
    .sort(
      (a, b) =>
        (order.get(`articles/${a.slug}`) ?? Infinity) - (order.get(`articles/${b.slug}`) ?? Infinity) ||
        a.slug.localeCompare(b.slug, 'ja'),
    );
}

export function getDirectoryCategories(articles: DirectoryArticle[]): ArticleCategory[] {
  return articleCategoryDefinitions
    .filter((category) => articles.some((article) => article.category.id === category.id))
    .map(({ id, title }) => ({ id, title }));
}

/** Multiple tags narrow the results to articles matching every selected tag. */
export function filterArticles(articles: DirectoryArticle[], { category, tags }: ArticleFilters) {
  return articles.filter(
    (article) =>
      (!category || article.category.id === category) && tags.every((tag) => article.frontmatter.tags.includes(tag)),
  );
}

export function getArticleTags(articles: DirectoryArticle[]): string[] {
  return [...new Set(articles.flatMap((article) => article.frontmatter.tags))].sort((a, b) => a.localeCompare(b, 'ja'));
}

export function articleDirectoryHref({ category = '', tags = [] }: Partial<ArticleFilters> = {}): string {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  for (const tag of new Set(tags)) params.append('tag', tag);
  return `/articles/${params.size ? `?${params}` : ''}`;
}

export function getRelatedArticles(articles: DirectoryArticle[], slug: string, limit = 3): DirectoryArticle[] {
  const current = articles.find((article) => article.slug === slug);
  if (!current) return [];
  return articles
    .filter((article) => article.slug !== slug)
    .map((article) => ({
      article,
      sharedTags: article.frontmatter.tags.filter((tag) => current.frontmatter.tags.includes(tag)).length,
      sameCategory: current.category.id !== uncategorized.id && article.category.id === current.category.id,
    }))
    .filter(({ sharedTags, sameCategory }) => sharedTags > 0 || sameCategory)
    .sort((a, b) => b.sharedTags - a.sharedTags || Number(b.sameCategory) - Number(a.sameCategory))
    .slice(0, Math.max(0, limit))
    .map(({ article }) => article);
}
