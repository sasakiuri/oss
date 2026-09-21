// SPDX-License-Identifier: MIT
import { copyFile, cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const outputDirectory = fileURLToPath(new URL('../public/content-styles/', import.meta.url));

/** Preserve KaTeX's relative font URLs and the installed packages' original CSS. */
export async function prepareContentStyles(directory = outputDirectory) {
  const katexStylesheet = require.resolve('katex/dist/katex.min.css');
  const highlightStylesheet = require.resolve('highlight.js/styles/github-dark.css');
  await mkdir(directory, { recursive: true });
  await Promise.all([
    copyFile(katexStylesheet, join(directory, 'katex.min.css')),
    cp(join(dirname(katexStylesheet), 'fonts'), join(directory, 'fonts'), { recursive: true }),
    copyFile(highlightStylesheet, join(directory, 'github-dark.css')),
  ]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareContentStyles();
}
