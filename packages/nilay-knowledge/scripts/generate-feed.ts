import fs from 'fs';
import path from 'path';
import RSS from 'rss';
import matter from 'gray-matter';
import { siteConfig } from '../lib/config';

const contentDirectory = path.join(process.cwd(), 'content');
const publicDirectory = path.join(process.cwd(), 'public');

interface FrontMatter {
  title: string;
  published: string;
}

interface ContentItem {
  slug: string;
  frontmatter: FrontMatter;
  content: string;
  type: 'articles' | 'news';
}

function getContentItems(type: 'articles' | 'news'): ContentItem[] {
  const dir = path.join(contentDirectory, type);
  const directories = fs.readdirSync(dir);

  return directories
    .filter((slug) => {
      const fullPath = path.join(dir, slug);
      return (
        fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, 'index.md'))
      );
    })
    .map((slug) => {
      const filePath = path.join(dir, slug, 'index.md');
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const { data, content } = matter(fileContents);
      return {
        slug,
        frontmatter: data as FrontMatter,
        content,
        type,
      };
    })
    .sort(
      (a, b) =>
        new Date(b.frontmatter.published).getTime() -
        new Date(a.frontmatter.published).getTime()
    );
}

function generateFeed() {
  const feed = new RSS({
    title: siteConfig.title,
    description: siteConfig.description,
    site_url: siteConfig.siteUrl,
    feed_url: `${siteConfig.siteUrl}/feed.xml`,
    language: 'ja',
    pubDate: new Date(),
    copyright: `© ${new Date().getFullYear()} ${siteConfig.author.name}`,
  });

  const articles = getContentItems('articles');
  const news = getContentItems('news');

  // Combine and sort all items
  const allItems = [...articles, ...news].sort(
    (a, b) =>
      new Date(b.frontmatter.published).getTime() -
      new Date(a.frontmatter.published).getTime()
  );

  // Add items to feed
  allItems.forEach((item) => {
    feed.item({
      title: item.frontmatter.title,
      description: item.content.slice(0, 200),
      url: `${siteConfig.siteUrl}/${item.type}/${item.slug}/`,
      date: new Date(item.frontmatter.published),
    });
  });

  // Write feed.xml to public directory
  fs.writeFileSync(path.join(publicDirectory, 'feed.xml'), feed.xml({ indent: true }));
  console.log('Generated: public/feed.xml');
}

generateFeed();
