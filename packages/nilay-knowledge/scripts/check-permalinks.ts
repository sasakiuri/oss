import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPublishedFragments, comparePublishedFragments, type FragmentBaseline } from '../lib/content/fragments';
import { parseContentTree } from '../lib/content/grammar';
import { contentPath } from '../lib/content/paths';

import { readPublicationContent } from './publication-content';

async function main() {
  if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--write-baseline')) {
    throw new Error('Usage: check-permalinks.ts [--write-baseline]');
  }
  const baselineFile = new URL('../content/published-fragments.json', import.meta.url);
  const proposed: FragmentBaseline = {};
  for (const source of await readPublicationContent()) {
    proposed[contentPath(source.type, source.slug)] = collectPublishedFragments(parseContentTree(source));
  }
  if (process.argv[2] === '--write-baseline') {
    await writeFile(baselineFile, `${JSON.stringify(proposed, null, 2)}\n`);
    console.log(
      'Wrote the proposed permalink baseline. Review every removal or changed destination before committing.',
    );
    return;
  }
  const previous = JSON.parse(await readFile(baselineFile, 'utf8')) as FragmentBaseline;
  const problems = comparePublishedFragments(previous, proposed);
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(
    `Checked published fragments in ${Object.keys(proposed).length} articles/news; no compatibility regressions.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
