// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

import remarkStringify from 'remark-stringify';
import { visit } from 'unist-util-visit';

import { resolveDocLink, siteLinkUrl } from '../src/entities/document/links';
import type { DocumentRecord } from '../src/entities/document/model';
import { markdownParser } from '../src/entities/document/parse';

const directory = 'dist/docs';
await mkdir(`${directory}/diagrams`, { recursive: true });
const documents = JSON.parse(await readFile('.generated/documents.json', 'utf8')) as DocumentRecord[];
const prefixes = new Map(documents.map((doc, index) => [doc.href, `chapter-${index}`]));
const processor = markdownParser().use(remarkStringify);
const chapters: string[] = [];
for (const document of documents) {
  const tree = processor.parse(document.markdown);
  const prefix = prefixes.get(document.href)!;
  const headings = document.headings.values();
  visit(tree, (node) => {
    if (node.type === 'heading') {
      // Pandoc attributes are kept as raw inline HTML then restored after Markdown serialization.
      node.children.push({ type: 'html', value: ` {#${prefix}-${headings.next().value!.id}}` });
    }
    if (node.type === 'link' || node.type === 'definition') {
      const url = siteLinkUrl(resolveDocLink(node.url, document.sourcePath), document.href);
      const target = url && prefixes.get(url.pathname);
      if (url && target) node.url = `#${target}${url.hash ? '-' + decodeURIComponent(url.hash.slice(1)) : ''}`;
    }
  });
  let markdown = processor.stringify(tree);
  for (const match of [...markdown.matchAll(/```(?:mermaid|dot|graphviz)\s*\n([\s\S]*?)\n```/g)]) {
    const hash = createHash('sha256')
      .update(match[1]?.trim() ?? '')
      .digest('hex');
    const image = `diagrams/${hash}.png`;
    await access(`${directory}/${image}`);
    markdown = markdown.replace(match[0], `![文書内の図](${image})`);
  }
  chapters.push(`[]{#${prefix}}\n\n${markdown}`);
}
await writeFile(`${directory}/saika-manual.md`, chapters.join('\n\n\\newpage\n\n'));
for (const file of ['pandoc-diagrams.lua', 'pandoc.yaml']) await copyFile(`scripts/${file}`, `${directory}/${file}`);
console.log('Prepared Pandoc chapters with unique heading IDs, internal links and rendered diagrams.');
