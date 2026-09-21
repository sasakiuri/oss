import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkLint from 'remark-lint';
import remarkLintNoDuplicateDefinitions from 'remark-lint-no-duplicate-definitions';
import remarkLintNoUndefinedReferences from 'remark-lint-no-undefined-references';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { VFile } from 'vfile';

import { remarkContentDirectives } from '../lib/content/directives';

const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkMath)
  .use(remarkLint)
  .use(remarkLintNoUndefinedReferences, {
    // These markers are consumed by the site's GitHub alert renderer.
    allow: ['!NOTE', '!TIP', '!IMPORTANT', '!WARNING', '!CAUTION'],
  })
  .use(remarkLintNoDuplicateDefinitions)
  .use(remarkContentDirectives, { lint: true });

/** Keep frontmatter in the parse so diagnostics retain their original line numbers. */
export async function lintMarkdown(value: string, filename: string) {
  const file = new VFile({ value, path: filename });
  await processor.run(processor.parse(file), file);
  return file;
}

export async function lintMarkdownDirectory(directory: string): Promise<VFile[]> {
  const files: VFile[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await lintMarkdownDirectory(filename)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(await lintMarkdown(await readFile(filename, 'utf8'), filename));
    }
  }
  return files;
}

async function main() {
  if (process.argv.length > 3) throw new Error('Usage: lint-markdown.ts [content-directory]');
  const directory = process.argv[2] ?? fileURLToPath(new URL('../content/', import.meta.url));
  const files = await lintMarkdownDirectory(directory);
  if (files.length === 0) throw new Error('No Markdown content found to check.');

  let problems = 0;
  for (const file of files) {
    for (const message of file.messages) {
      console.error(
        `${path.relative(process.cwd(), file.path)}:${message.line ?? 1}:${message.column ?? 1} ${message.ruleId}: ${message.reason}`,
      );
      problems++;
    }
  }
  console.log(`Checked ${files.length} Markdown files; ${problems} reference problems.`);
  if (problems > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
