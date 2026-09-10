// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';

const manifests = [];
for (let index = 0; index < 2; index++) {
  for (const directory of ['out', '.next', '.generated']) await rm(directory, { recursive: true, force: true });
  execFileSync('npm', ['run', 'build:static'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TZ: 'UTC',
      NEXT_PUBLIC_SITE_URL: 'https://docs.example.test',
      NEXT_PUBLIC_BASE_PATH: '',
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_RELEASE: 'reproducibility-check',
    },
  });
  manifests.push(JSON.parse(await readFile('out/artifact-manifest.json', 'utf8')));
}
const first = new Map(manifests[0].files.map((file) => [file.file, file.sha256]));
const second = new Map(manifests[1].files.map((file) => [file.file, file.sha256]));
const changes = [...new Set([...first.keys(), ...second.keys()])].filter(
  (file) => first.get(file) !== second.get(file),
);
await mkdir('reports', { recursive: true });
await writeFile(
  'reports/reproducibility.json',
  JSON.stringify({ passed: changes.length === 0, changes }, null, 2) + '\n',
);
if (changes.length) throw new Error(`Clean builds differ: ${changes.join(', ')}`);
console.log('Two clean static builds are byte-identical.');
