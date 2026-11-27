// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { copyFile, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// @ts-expect-error Shared artifact helpers.
import { inventory, qualityReports, sha256, sourceEpoch, sourceIdentity } from './lib/artifact.mjs';

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
for (const [suite, source] of Object.entries(qualityReports as Record<string, string>)) {
  const provenance = JSON.parse(await readFile(`reports/provenance/${suite}.json`, 'utf8')) as {
    sourceHash: string;
    sha256: string;
  };
  if (provenance.sourceHash !== identity.sourceHash || provenance.sha256 !== sha256(await readFile(source)))
    throw new Error(`Stale quality report: ${suite}`);
  await copyFile(source, `${root}/checks/${suite}${path.extname(source)}`);
  await copyFile(`reports/provenance/${suite}.json`, `${root}/checks/${suite}-provenance.json`);
}
const artifacts = await inventory(root, ['manifest.json']);
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
