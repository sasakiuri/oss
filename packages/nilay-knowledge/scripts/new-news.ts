import fs from 'fs';
import path from 'path';

const contentDirectory = path.join(process.cwd(), 'content', 'news');

function generateSlug(): string {
  // YYYYMMDD format (same as existing news)
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  let slug = `${year}${month}${day}`;

  // Check if slug already exists, if so add suffix
  const existingDir = path.join(contentDirectory, slug);
  if (fs.existsSync(existingDir)) {
    let suffix = 1;
    while (fs.existsSync(path.join(contentDirectory, `${slug}-${suffix}`))) {
      suffix++;
    }
    slug = `${slug}-${suffix}`;
  }

  return slug;
}

function formatDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  const offsetHours = Math.abs(Math.floor(offset / 60));
  const offsetMinutes = Math.abs(offset % 60);
  const offsetSign = offset <= 0 ? '+' : '-';
  const offsetString = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;

  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}T${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}${offsetString}`;
}

function createNews(title?: string): void {
  const slug = generateSlug();
  const newsDir = path.join(contentDirectory, slug);
  const newsPath = path.join(newsDir, 'index.md');

  // Create directory
  fs.mkdirSync(newsDir, { recursive: true });

  const now = new Date();
  const dateString = formatDate(now);
  const newsTitle = title || '新しいニュース';

  const content = `---
title: "${newsTitle}"
published: "${dateString}"
tags: []
---

ここにニュースの内容を書いてください。
`;

  fs.writeFileSync(newsPath, content);
  console.log(`Created: content/news/${slug}/index.md`);
}

// Get title from command line arguments
const title = process.argv[2];
createNews(title);
