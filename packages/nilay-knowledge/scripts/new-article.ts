import fs from 'fs';
import path from 'path';

const contentDirectory = path.join(process.cwd(), 'content', 'articles');

function generateSlug(): string {
  // Unix timestamp in seconds (same format as existing articles)
  return Math.floor(Date.now() / 1000).toString();
}

function formatDate(date: Date): string {
  const offset = date.getTimezoneOffset();
  const offsetHours = Math.abs(Math.floor(offset / 60));
  const offsetMinutes = Math.abs(offset % 60);
  const offsetSign = offset <= 0 ? '+' : '-';
  const offsetString = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;

  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}T${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}${offsetString}`;
}

function createArticle(title?: string): void {
  const slug = generateSlug();
  const articleDir = path.join(contentDirectory, slug);
  const articlePath = path.join(articleDir, 'index.md');

  // Create directory
  fs.mkdirSync(articleDir, { recursive: true });

  const now = new Date();
  const dateString = formatDate(now);
  const articleTitle = title || '新しい記事';

  const content = `---
title: "${articleTitle}"
published: "${dateString}"
tags: []
---

ここに記事の内容を書いてください。
`;

  fs.writeFileSync(articlePath, content);
  console.log(`Created: content/articles/${slug}/index.md`);
}

// Get title from command line arguments
const title = process.argv[2];
createArticle(title);
