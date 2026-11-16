import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import tailwindConfig from '../../../../../tailwind.config.js';

const packageRoot = resolve(import.meta.dirname, '../../../../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('renderer colour tokens', () => {
  it('uses only vscode colours defined in the Tailwind theme', () => {
    const colors = tailwindConfig.theme?.extend?.colors as { vscode: Record<string, string> };
    const defined = new Set(Object.keys(colors.vscode));
    const files = [
      ...sourceFiles(join(packageRoot, 'src/renderer')),
      join(packageRoot, 'index.html'),
      join(packageRoot, 'board.html'),
    ];

    const undefinedTokens = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/-vscode-([a-z0-9-]+)/g)]
        .map((match) => match[1]!)
        .filter((token) => !defined.has(token))
        .map((token) => `${relative(packageRoot, file)}: vscode-${token}`),
    );

    expect(undefinedTokens).toEqual([]);
  });
});
