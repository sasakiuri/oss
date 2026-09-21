// cspell:words hhttps
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { siteConfig } from '../lib/config';
import { renderContent } from '../lib/content/render';
import { createContentRepository } from '../lib/content/repository';
import { contentTypes } from '../lib/content/types';

/** Build link-check inputs using the site's renderer and actual published asset paths. */
export async function prepareLinkCheck(packageDirectory: string) {
  const outputDirectory = path.join(packageDirectory, '.cache', 'links');
  const siteDirectory = path.join(outputDirectory, 'site');
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(siteDirectory, { recursive: true });

  const publicDirectory = path.join(packageDirectory, 'public');
  for (const entry of await readdir(publicDirectory, { withFileTypes: true })) {
    await symlink(
      path.join(publicDirectory, entry.name),
      path.join(siteDirectory, entry.name),
      entry.isDirectory() ? 'junction' : 'file',
    );
  }
  // The /content route reads the authored tree directly; expose the same files to lychee.
  await symlink(path.join(packageDirectory, 'content'), path.join(siteDirectory, 'content'), 'junction');

  // Only actual static App Router pages become targets. Dynamic article/news pages
  // are populated below from the repository, so a misspelled route stays missing.
  async function addPageTargets(directory: string, segments: string[] = []): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('[') && !entry.name.startsWith('_')) {
        const next = /^\(.*\)$/.test(entry.name) ? segments : [...segments, entry.name];
        await addPageTargets(path.join(directory, entry.name), next);
      } else if (entry.name === 'page.tsx') {
        const target = path.join(siteDirectory, ...segments);
        await mkdir(target, { recursive: true });
        await writeFile(path.join(target, 'index.html'), '<!doctype html><html><body></body></html>');
      }
    }
  }
  await addPageTargets(path.join(packageDirectory, 'app'));

  const repository = createContentRepository(path.join(packageDirectory, 'content'));
  const files: string[] = [];
  for (const type of contentTypes) {
    for (const source of await repository.listSources(type)) {
      const directory = path.join(siteDirectory, type, source.slug);
      await mkdir(directory, { recursive: true });
      const filename = path.join(directory, 'index.html');
      const { html } = await renderContent(source);
      const processor = unified().use(rehypeRaw).use(rehypeStringify);
      const tree = await processor.run({ type: 'root', children: [{ type: 'raw', value: html }] });
      for (const reference of source.frontmatter.review?.sources ?? []) {
        tree.children.push({
          type: 'element',
          tagName: 'a',
          properties: { href: reference.url },
          children: [{ type: 'text', value: reference.title }],
        });
      }
      // Check real attributes; code examples and data attributes are not links.
      visit(tree, 'element', (node) => {
        for (const attribute of ['href', 'src'] as const) {
          const value = node.properties[attribute];
          if (typeof value !== 'string') continue;
          // lychee silently skips unknown schemes, including typos such as hhttps:.
          const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value.trim())?.[1]?.toLowerCase();
          if (scheme && !['http', 'https', 'mailto', 'tel', 'data'].includes(scheme)) {
            throw new Error(`Unsupported URL scheme in content/${type}/${source.slug}/index.md: ${value}`);
          }
          // Filesystem inputs lack the HTTPS scheme a browser would inherit.
          if (value.startsWith('//')) node.properties[attribute] = `https:${value}`;
        }
      });
      const resolvedHtml = processor.stringify(tree);
      await writeFile(filename, `<!doctype html><html><body>${resolvedHtml}</body></html>`);
      files.push(filename);
    }
  }
  if (files.length === 0) throw new Error('No article or news content found to check.');

  const siteOrigin = new URL(siteConfig.siteUrl).host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const remap = `^https?://${siteOrigin}(/.*)?$ ${pathToFileURL(siteDirectory).href}$1`;
  const config = path.join(outputDirectory, 'lychee.toml');
  await writeFile(
    config,
    `${await readFile(path.join(packageDirectory, 'lychee.toml'), 'utf8')}\nroot_dir = ${JSON.stringify(siteDirectory)}\nremap = [${JSON.stringify(remap)}]\n`,
  );
  const inputs = path.join(outputDirectory, 'inputs.txt');
  await writeFile(inputs, `${files.join('\n')}\n`);
  return { config, inputs, outputDirectory, siteDirectory };
}
