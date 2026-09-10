// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { inventory, sha256, verifyArtifact } from '../../scripts/lib/artifact.mjs';

test('artifact seal rejects modified, missing, extra and linked files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'saika-artifact-'));
  try {
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>Fixture</title>');
    const files = await inventory(root);
    await writeFile(
      path.join(root, 'artifact-manifest.json'),
      JSON.stringify({ files, treeHash: sha256(JSON.stringify(files)) }),
    );
    await verifyArtifact(root);
    await writeFile(path.join(root, 'extra.js'), 'extra');
    await assert.rejects(verifyArtifact(root), /file set/);
    await rm(path.join(root, 'extra.js'));
    await writeFile(path.join(root, 'index.html'), 'modified');
    await assert.rejects(verifyArtifact(root), /file set/);
    await rm(path.join(root, 'index.html'));
    await assert.rejects(verifyArtifact(root), /file set/);
    await symlink('/etc/passwd', path.join(root, 'index.html'));
    await assert.rejects(verifyArtifact(root), /symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
