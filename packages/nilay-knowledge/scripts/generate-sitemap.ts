import { writeFile } from 'node:fs/promises';

import { createSitemap } from '../lib/content/publication';

import { publicFile, readPublicationContent } from './publication-content';

async function main() {
  const items = await readPublicationContent();
  await writeFile(publicFile('sitemap.xml'), createSitemap(items));
  console.log('Generated: public/sitemap.xml');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
