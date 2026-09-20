import { fileURLToPath } from 'node:url';

import { createContentRepository } from '../lib/content/repository';
import { contentTypes } from '../lib/content/types';

const repository = createContentRepository(fileURLToPath(new URL('../content/', import.meta.url)));

export async function readPublicationContent() {
  return (await Promise.all(contentTypes.map((type) => repository.listSources(type)))).flat();
}

export function publicFile(filename: string): URL {
  return new URL(`../public/${filename}`, import.meta.url);
}
