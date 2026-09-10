// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, rm, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function files(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(directory, { withFileTypes: true })).map((entry) =>
        entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)],
      ),
    )
  ).flat();
}
// @ts-expect-error Shared artifact helpers.
const { sourceIdentity, sha256, sourceEpoch } = await import('./lib/artifact.mjs');
const identity = await sourceIdentity();
const root = 'dist/docs';
const build = JSON.parse(await readFile(`${root}/build.json`, 'utf8')) as { sourceHash?: string };
if (build.sourceHash !== identity.sourceHash) throw new Error('PDF was built from different sources. Regenerate it.');
await rm(`${root}/checks`, { recursive: true, force: true });
await rm(`${root}/licenses`, { recursive: true, force: true });
await mkdir(`${root}/checks`, { recursive: true });
await mkdir(`${root}/licenses`, { recursive: true });
await copyFile('LICENSE', `${root}/licenses/MIT.txt`);
await copyFile('assets/fonts/OFL.txt', `${root}/licenses/NotoSansJP-OFL.txt`);
await copyFile('THIRD-PARTY-LICENSES.txt', `${root}/licenses/THIRD-PARTY-LICENSES.txt`);
for (const [source, name] of [
  ['coverage/coverage-summary.json', 'coverage.json'],
  ['.lighthouse.reports/summary.json', 'lighthouse.json'],
  ['test-results/playwright.xml', 'playwright.xml'],
  ['reports/storybook/storybook.xml', 'storybook.xml'],
]) {
  const suite = (
    {
      'coverage.json': 'coverage',
      'lighthouse.json': 'lighthouse',
      'playwright.xml': 'playwright',
      'storybook.xml': 'storybook',
    } as Record<string, string>
  )[name!]!;
  const provenance = JSON.parse(await readFile(`reports/provenance/${suite}.json`, 'utf8')) as {
    sourceHash: string;
    sha256: string;
  };
  if (provenance.sourceHash !== identity.sourceHash || provenance.sha256 !== sha256(await readFile(source!)))
    throw new Error(`Stale quality report: ${suite}`);
  await copyFile(source!, `${root}/checks/${name}`);
  await copyFile(`reports/provenance/${suite}.json`, `${root}/checks/${suite}-provenance.json`);
}
const list = (await files(root)).filter((file) => !file.endsWith('manifest.json')).sort();
const artifacts = await Promise.all(
  list.map(async (file) => {
    const data = await readFile(file);
    return {
      file: path.relative(root, file),
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  }),
);
await writeFile(
  `${root}/manifest.json`,
  JSON.stringify({ ...(JSON.parse(await readFile(`${root}/build.json`, 'utf8')) as object), artifacts }, null, 2),
);
execFileSync(
  'tar',
  [
    '--sort=name',
    `--mtime=@${sourceEpoch()}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-czf',
    'dist/saika-docs.tar.gz',
    '-C',
    root,
    '.',
  ],
  { stdio: 'inherit' },
);
console.log('Packaged dist/saika-docs.tar.gz with SHA-256 manifest.');
