// SPDX-License-Identifier: MIT
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createPackage } from '@electron/asar';

describe('packaged license verifier', () => {
  it('reads scoped dependency metadata using native ASAR paths', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'saika-license-verifier-'));

    try {
      const repositoryRoot = resolve(__dirname, '../../../../..');
      const applicationRoot = join(repositoryRoot, 'packages', 'saika-lane');
      const sourceDirectory = join(temporaryRoot, 'source');
      const dependencyDirectory = join(sourceDirectory, 'node_modules', '@babel', 'runtime');
      const resourcesDirectory = join(temporaryRoot, 'resources');
      const archivePath = join(resourcesDirectory, 'app.asar');
      const licenseReport = await readFile(join(applicationRoot, 'THIRD-PARTY-LICENSES.txt'), 'utf8');
      const runtimeVersion = licenseReport.match(/ - @babel\/runtime@([^\s]+)/)?.[1];
      expect(runtimeVersion).toBeDefined();

      await Promise.all([
        mkdir(dependencyDirectory, { recursive: true }),
        mkdir(resourcesDirectory, { recursive: true }),
      ]);
      await writeFile(
        join(dependencyDirectory, 'package.json'),
        JSON.stringify({ name: '@babel/runtime', version: runtimeVersion }),
      );
      await createPackage(sourceDirectory, archivePath);
      await Promise.all([
        copyFile(join(applicationRoot, 'LICENSE'), join(resourcesDirectory, 'LICENSE')),
        copyFile(
          join(applicationRoot, 'THIRD-PARTY-LICENSES.txt'),
          join(resourcesDirectory, 'THIRD-PARTY-LICENSES.txt'),
        ),
      ]);

      const result = spawnSync(
        process.execPath,
        [join(repositoryRoot, 'scripts', 'verify-packaged-licenses.mjs'), archivePath],
        { encoding: 'utf8' },
      );

      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
      }
      expect(result.stdout).toContain('1 packaged dependencies');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
