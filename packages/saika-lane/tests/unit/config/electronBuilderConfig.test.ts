// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ElectronBuilderConfig {
  linux?: {
    executableName?: string;
  };
}

describe('electron-builder configuration', () => {
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../../../electron-builder.json'), 'utf8'),
  ) as ElectronBuilderConfig;

  it('uses a path-safe Linux executable name', () => {
    expect(config.linux?.executableName).toMatch(/^[-A-Za-z0-9_. ]+$/);
  });
});
