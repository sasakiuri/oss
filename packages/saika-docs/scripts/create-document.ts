// SPDX-License-Identifier: MIT
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [slug, title] = process.argv.slice(2);
if (!slug || !/^(common|lane|director)\/[a-z0-9-]+$/.test(slug) || !title?.trim() || /[\r\n]/.test(title))
  throw new Error('Usage: npm run content:new -- common/slug "Title"');
const filename = path.resolve(`${slug}.md`);
await mkdir(path.dirname(filename), { recursive: true });
const date = new Date().toISOString().slice(0, 10);
await writeFile(
  filename,
  `---\ntitle: ${JSON.stringify(title)}\npublished: "${date}"\nupdated: "${date}"\ntags: []\n---\n\n# ${title}\n\n`,
  { flag: 'wx' },
);
console.log(`Created ${slug}.md`);
