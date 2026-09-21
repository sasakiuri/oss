import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareLinkCheck } from './link-check';

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => !['--prepare', '--external'].includes(arg))) {
    throw new Error('Usage: check-links.ts [--prepare | --external]');
  }
  const prepareOnly = args.includes('--prepare');
  const binary = process.env.LYCHEE_BIN || 'lychee';
  if (!prepareOnly) {
    const probe = spawnSync(binary, ['--version'], { encoding: 'utf8' });
    if (probe.error || probe.status !== 0) {
      throw new Error(
        'lychee is unavailable. Install lychee v0.24.2 (https://lychee.cli.rs/installation/) and add it to PATH, or set LYCHEE_BIN to its executable path.',
      );
    }
  }
  const packageDirectory = fileURLToPath(new URL('../', import.meta.url));
  const { config, inputs, outputDirectory } = await prepareLinkCheck(packageDirectory);
  console.log(`Prepared content link inputs: ${path.relative(packageDirectory, outputDirectory)}`);
  if (prepareOnly) return;

  const external = args.includes('--external');
  const output = path.join(outputDirectory, external ? 'external.md' : 'internal.md');
  const result = spawnSync(
    binary,
    [
      '--config',
      config,
      '--files-from',
      inputs,
      '--format',
      'markdown',
      '--output',
      output,
      ...(external ? [] : ['--offline']),
    ],
    { cwd: packageDirectory, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  console.log(`Link report: ${path.relative(packageDirectory, output)}`);
  process.exitCode = result.status ?? 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
