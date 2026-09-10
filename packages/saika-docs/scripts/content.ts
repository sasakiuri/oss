// SPDX-License-Identifier: MIT
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import chokidar from 'chokidar';

import type { DocumentRecord } from '../src/entities/document/model';
import { documentLinks, parseDocument } from '../src/entities/document/parse';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set([
  'node_modules',
  'AGENTS.md',
  'AGENTS.local.md',
  'CLAUDE.md',
  'src',
  'scripts',
  'tests',
  'e2e',
  'dist',
  'out',
  'coverage',
  'reports',
  'tools',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

async function readDocuments(directory: string): Promise<DocumentRecord[]> {
  const records: DocumentRecord[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) records.push(...(await readDocuments(path)));
    if (entry.isFile() && entry.name.endsWith('.md'))
      records.push(parseDocument(relative(root, path).replaceAll('\\', '/'), await readFile(path, 'utf8')));
  }
  return records.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath, 'en'));
}

async function generate() {
  const records = await readDocuments(root);
  const routes = new Map<string, DocumentRecord>();
  for (const record of records) {
    if (record.image) await access(join(root, 'public', record.image.slice(1)));
    if (routes.has(record.href)) throw new Error(`Duplicate route: ${record.href}`);
    routes.set(record.href, record);
  }
  for (const record of records) {
    for (const link of documentLinks(record)) {
      if (!link.startsWith('/') && !link.startsWith('#')) continue;
      const url = new URL(link, `https://docs.invalid${record.href}`);
      const target = routes.get(url.pathname);
      if (!target) throw new Error(`Broken document link in ${record.sourcePath}: ${link}`);
      if (url.hash && !target.headings.some((heading) => heading.id === decodeURIComponent(url.hash.slice(1)))) {
        throw new Error(`Missing heading in ${record.sourcePath}: ${link}`);
      }
    }
  }
  const output = join(root, '.generated/documents.json');
  const serialized = `${JSON.stringify(records)}\n`;
  const previous = await readFile(output, 'utf8').catch(() => '');
  if (previous !== serialized) {
    await mkdir(join(root, '.generated'), { recursive: true });
    await writeFile(output, serialized);
  }
  console.log(`Prepared ${records.length} Markdown documents; links and headings verified.`);
}

await generate();
if (process.argv.includes('--watch')) {
  let pending = Promise.resolve();
  chokidar
    .watch(root, {
      ignoreInitial: true,
      ignored: (path) =>
        relative(root, path)
          .split(/[\\/]/)
          .some((part) => part.startsWith('.') || excluded.has(part)),
    })
    .on('all', (_event, path) => {
      if (!path.endsWith('.md')) return;
      pending = pending.then(generate).catch((error: unknown) => console.error(error));
    });
}
