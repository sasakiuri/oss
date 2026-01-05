import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import remarkGithubAlerts from 'remark-github-alerts';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';

const contentDirectory = path.join(process.cwd(), 'content');

// Link icon SVG for heading anchors
const linkIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

// Create unified processor
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkMath)
  .use(remarkGithubAlerts)
  .use(remarkRehype, {
    allowDangerousHtml: true,
    footnoteLabel: '脚注',
    footnoteLabelTagName: 'h2',
  })
  .use(rehypeRaw)
  .use(rehypeSlug)
  .use(rehypeHighlight)
  .use(rehypeKatex)
  .use(rehypeStringify);

function addHeadingAnchors(html: string): string {
  // Add anchor links to h1-h6 headings
  return html.replace(
    /<h([1-6])\s+id="([^"]+)"([^>]*)>([^<]*)<\/h\1>/g,
    (_, level, id, attrs, text) => {
      const anchor = `<a href="#${id}" class="heading-anchor" aria-label="この見出しへのリンク">${linkIconSvg}</a>`;
      return `<h${level} id="${id}"${attrs} class="heading-with-anchor">${anchor}${text}</h${level}>`;
    }
  );
}

async function processMarkdown(content: string): Promise<string> {
  const result = await processor.process(content);
  return addHeadingAnchors(String(result));
}

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
  html: string;
  tableOfContents: TocItem[];
}

export interface NewsItem {
  slug: string;
  frontmatter: NewsFrontmatter;
  content: string;
  html: string;
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
    const hashes = match[1];
    const title = match[2];
    if (!hashes || !title) continue;

    const level = hashes.length;
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

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const articlePath = path.join(contentDirectory, 'articles', slug, 'index.md');

  if (!fs.existsSync(articlePath)) {
    return null;
  }

  const fileContents = fs.readFileSync(articlePath, 'utf8');
  const { data, content } = matter(fileContents);

  const processedContent = rewriteRelativePaths(content, 'articles', slug);
  const tableOfContents = extractTableOfContents(content);
  const html = await processMarkdown(processedContent);

  return {
    slug,
    frontmatter: data as ArticleFrontmatter,
    content: processedContent,
    html,
    tableOfContents,
  };
}

export async function getNewsBySlug(slug: string): Promise<NewsItem | null> {
  const newsPath = path.join(contentDirectory, 'news', slug, 'index.md');

  if (!fs.existsSync(newsPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(newsPath, 'utf8');
  const { data, content } = matter(fileContents);

  const processedContent = rewriteRelativePaths(content, 'news', slug);
  const html = await processMarkdown(processedContent);

  return {
    slug,
    frontmatter: data as NewsFrontmatter,
    content: processedContent,
    html,
  };
}

export async function getAllArticles(): Promise<Article[]> {
  const slugs = getArticleSlugs();
  const articles = await Promise.all(slugs.map((slug) => getArticleBySlug(slug)));
  const validArticles = articles.filter((article): article is Article => article !== null);

  return validArticles.sort(
    (a, b) =>
      new Date(b.frontmatter.published).getTime() -
      new Date(a.frontmatter.published).getTime()
  );
}

export async function getAllNews(): Promise<NewsItem[]> {
  const slugs = getNewsSlugs();
  const newsItems = await Promise.all(slugs.map((slug) => getNewsBySlug(slug)));
  const validNewsItems = newsItems.filter((news): news is NewsItem => news !== null);

  return validNewsItems.sort(
    (a, b) =>
      new Date(b.frontmatter.published).getTime() -
      new Date(a.frontmatter.published).getTime()
  );
}

export async function getNewsByTag(tag: string): Promise<NewsItem[]> {
  const allNews = await getAllNews();
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
