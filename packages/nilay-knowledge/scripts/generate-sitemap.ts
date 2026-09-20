import fs from 'fs';
import path from 'path';

const contentDirectory = path.join(process.cwd(), 'content');
const publicDirectory = path.join(process.cwd(), 'public');

const siteUrl = 'https://knowledge.nilay.jp';

function getDirectorySlugs(type: 'articles' | 'news'): string[] {
  const dir = path.join(contentDirectory, type);
  const directories = fs.readdirSync(dir);

  return directories.filter((slug) => {
    const fullPath = path.join(dir, slug);
    return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'index.md'));
  });
}

function generateSitemap() {
  const staticPages = [
    { url: siteUrl, priority: '1.0' },
    { url: `${siteUrl}/articles/`, priority: '0.8' },
    { url: `${siteUrl}/news/`, priority: '0.8' },
    { url: `${siteUrl}/about/`, priority: '0.5' },
  ];

  const articleSlugs = getDirectorySlugs('articles');
  const newsSlugs = getDirectorySlugs('news');

  const articlePages = articleSlugs.map((slug) => ({
    url: `${siteUrl}/articles/${slug}/`,
    priority: '0.7',
  }));

  const newsPages = newsSlugs.map((slug) => ({
    url: `${siteUrl}/news/${slug}/`,
    priority: '0.5',
  }));

  const allPages = [...staticPages, ...articlePages, ...newsPages];
  const today = new Date().toISOString().split('T')[0];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${page.url}</loc>
    <lastmod>${today}</lastmod>
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(publicDirectory, 'sitemap.xml'), sitemap);
  console.log('Generated: public/sitemap.xml');
}

generateSitemap();
