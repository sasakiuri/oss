// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { prepareContentStyles } from './prepare-content-styles.mjs';

const require = createRequire(import.meta.url);

test('prepared CSS and every referenced font match the installed packages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-content-styles-'));
  try {
    await prepareContentStyles(directory);
    // Repeated dev/build preparation must leave complete, identical assets.
    await prepareContentStyles(directory);
    const sourceCss = require.resolve('katex/dist/katex.min.css');
    const css = await readFile(join(directory, 'katex.min.css'), 'utf8');
    assert.equal(css, await readFile(sourceCss, 'utf8'));
    const fonts = [...css.matchAll(/url\((?:["']?)(fonts\/[^)'"\s]+)["']?\)/g)].map((match) => match[1]);
    assert.ok(fonts.length > 0, 'KaTeX CSS must reference its font files');
    for (const font of new Set(fonts)) {
      assert.deepEqual(await readFile(join(directory, font)), await readFile(join(dirname(sourceCss), font)), font);
    }
    assert.deepEqual(
      await readFile(join(directory, 'github-dark.css')),
      await readFile(require.resolve('highlight.js/styles/github-dark.css')),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
