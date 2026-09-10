// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const docsRoot = fileURLToPath(new URL('../../', import.meta.url));
const excluded = new Set([
  'node_modules',
  '.next',
  '.generated',
  '.git',
  '.tools',
  'out',
  'dist',
  'coverage',
  'reports',
  'test-results',
  'playwright-report',
  'storybook-static',
  '.lighthouse.reports',
]);
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export async function files(root, relative = '', source = false) {
  const output = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    if (
      source &&
      (excluded.has(entry.name) ||
        entry.name.startsWith('.env') ||
        entry.name.endsWith('.tsbuildinfo') ||
        entry.name === 'next-env.d.ts')
    )
      continue;
    const name = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) output.push(...(await files(root, name, source)));
    else if (entry.isFile()) output.push(name);
    else throw new Error(`Unsupported symlink or device: ${name}`);
  }
  return output.sort();
}
export async function sourceIdentity() {
  const records = [];
  const generated = new Set([
    'public/favicon.ico',
    'public/icon-192.png',
    'public/icon-512.png',
    'public/apple-touch-icon.png',
    'public/opengraph-image.png',
    'public/asset-manifest.json',
  ]);
  for (const name of (await files(docsRoot, '', true)).filter((name) => !generated.has(name)))
    records.push([name, sha256(await readFile(path.join(docsRoot, name)))]);
  for (const name of ['package.json', 'package-lock.json', 'turbo.json'])
    records.push([`../../${name}`, sha256(await readFile(path.join(docsRoot, '../..', name)))]);
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: docsRoot, encoding: 'utf8' }).trim();
  return { revision, sourceHash: sha256(JSON.stringify(records)) };
}
export function sourceEpoch() {
  const value =
    process.env.SOURCE_DATE_EPOCH ??
    execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], { cwd: docsRoot, encoding: 'utf8' }).trim();
  if (!/^\d+$/.test(value)) throw new Error('Invalid SOURCE_DATE_EPOCH');
  return Number(value);
}
export async function inventory(root, omit = ['artifact-manifest.json']) {
  const result = [];
  for (const file of (await files(root)).filter((name) => !omit.includes(name))) {
    const bytes = await readFile(path.join(root, file));
    result.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return result;
}
export async function verifyArtifact(root) {
  if (!(await lstat(root)).isDirectory()) throw new Error('Artifact must be a directory');
  const expected = JSON.parse(await readFile(path.join(root, 'artifact-manifest.json'), 'utf8'));
  const actual = await inventory(root);
  if (JSON.stringify(expected.files) !== JSON.stringify(actual)) throw new Error('Artifact file set or hashes changed');
  if (expected.treeHash !== sha256(JSON.stringify(actual))) throw new Error('Invalid artifact tree hash');
  return expected;
}
