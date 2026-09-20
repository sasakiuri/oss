import { writeFile } from 'node:fs/promises';

import { createFeed } from '../lib/content/publication';

import { publicFile, readPublicationContent } from './publication-content';

async function main() {
  const items = await readPublicationContent();
  await writeFile(publicFile('feed.xml'), createFeed(items));
  console.log('Generated: public/feed.xml');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
