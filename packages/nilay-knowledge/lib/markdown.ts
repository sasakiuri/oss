import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const contentDirectory = path.join(process.cwd(), 'content');

export interface ArticleFrontmatter {
  title: string;
  published: string;
  updated?: string;
  tags: string[];
  image?: string;
}

export interface NewsFrontmatter {
  title: string;
  published: string;
  tags: string[];
}

export interface Article {
  slug: string;
  frontmatter: ArticleFrontmatter;
  content: string;
  tableOfContents: TocItem[];
}

export interface NewsItem {
  slug: string;
  frontmatter: NewsFrontmatter;
  content: string;
}

export interface TocItem {
  id: string;
  title: string;
  level: number;
}

function rewriteRelativePaths(
  markdown: string,
  type: 'articles' | 'news',
  slug: string
): string {
  // Rewrite relative image paths: ![alt](filename.png) -> ![alt](/content/articles/slug/filename.png)
  // Also handle PDF and other file links: [text](filename.pdf) -> [text](/content/articles/slug/filename.pdf)
  const basePath = `/content/${type}/${slug}`;

  // Match markdown images and links with relative paths (not starting with http, https, /, or #)
  return markdown.replace(
    /(!?\[([^\]]*)\])\(([^)]+)\)/g,
    (match, bracketPart, _altText, url) => {
      // Skip absolute URLs, root-relative paths, and anchor links
      if (
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('/') ||
        url.startsWith('#')
      ) {
        return match;
      }
      // Normalize path: remove leading ./ and handle ../ etc.
      const normalizedUrl = url.replace(/^\.\//, '');
      return `${bracketPart}(${basePath}/${normalizedUrl})`;
    }
  );
}

function extractTableOfContents(markdown: string): TocItem[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const toc: TocItem[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const title = match[2];
    const id = title
      .toLowerCase()
      .replace(/[^\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s-]/g, '')
      .replace(/\s+/g, '-');

    toc.push({ id, title, level });
  }

  return toc;
}

export function getArticleSlugs(): string[] {
  const articlesDir = path.join(contentDirectory, 'articles');
  const directories = fs.readdirSync(articlesDir);

  return directories.filter((dir) => {
    const fullPath = path.join(articlesDir, dir);
    return (
      fs.statSync(fullPath).isDirectory() &&
      fs.existsSync(path.join(fullPath, 'index.md'))
    );
  });
}

export function getNewsSlugs(): string[] {
  const newsDir = path.join(contentDirectory, 'news');
  const directories = fs.readdirSync(newsDir);

  return directories.filter((dir) => {
    const fullPath = path.join(newsDir, dir);
    return (
      fs.statSync(fullPath).isDirectory() &&
      fs.existsSync(path.join(fullPath, 'index.md'))
    );
  });
}

export function getArticleBySlug(slug: string): Article | null {
  const articlePath = path.join(contentDirectory, 'articles', slug, 'index.md');

  if (!fs.existsSync(articlePath)) {
    return null;
  }

  const fileContents = fs.readFileSync(articlePath, 'utf8');
  const { data, content } = matter(fileContents);

  const processedContent = rewriteRelativePaths(content, 'articles', slug);
  const tableOfContents = extractTableOfContents(content);

  return {
    slug,
    frontmatter: data as ArticleFrontmatter,
    content: processedContent,
    tableOfContents,
  };
}

export function getNewsBySlug(slug: string): NewsItem | null {
  const newsPath = path.join(contentDirectory, 'news', slug, 'index.md');

  if (!fs.existsSync(newsPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(newsPath, 'utf8');
  const { data, content } = matter(fileContents);

  const processedContent = rewriteRelativePaths(content, 'news', slug);

  return {
    slug,
    frontmatter: data as NewsFrontmatter,
    content: processedContent,
  };
}

export function getAllArticles(): Article[] {
  const slugs = getArticleSlugs();
  const articles = slugs
    .map((slug) => getArticleBySlug(slug))
    .filter((article): article is Article => article !== null);

  return articles.sort(
    (a, b) =>
      new Date(b.frontmatter.published).getTime() -
      new Date(a.frontmatter.published).getTime()
  );
}

export function getAllNews(): NewsItem[] {
  const slugs = getNewsSlugs();
  const newsItems = slugs
    .map((slug) => getNewsBySlug(slug))
    .filter((news): news is NewsItem => news !== null);

  return newsItems.sort(
    (a, b) =>
      new Date(b.frontmatter.published).getTime() -
      new Date(a.frontmatter.published).getTime()
  );
}

export function getNewsByTag(tag: string): NewsItem[] {
  const allNews = getAllNews();
  return allNews.filter((news) => news.frontmatter.tags.includes(tag));
}

export function getAssetPath(
  type: 'articles' | 'news' | 'assets',
  slug?: string,
  filename?: string
): string {
  if (type === 'assets') {
    return `/content/assets/${filename}`;
  }
  return `/content/${type}/${slug}/${filename}`;
}
