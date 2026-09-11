// SPDX-License-Identifier: MIT
import { mkdir, unlink, writeFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setLoginStart } from '../src/main/loginStart';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => '/opt/saika-vista' } }));
vi.mock('node:os', () => ({ homedir: () => '/home/vista-test' }));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe.skipIf(process.platform !== 'linux')('Linux login startup location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APPIMAGE', undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [undefined, '/home/vista-test/.config'],
    ['', '/home/vista-test/.config'],
    ['relative/config', '/home/vista-test/.config'],
    ['/custom/config', '/custom/config'],
  ])('enables and disables login startup under XDG_CONFIG_HOME=%j', async (configured, expected) => {
    vi.stubEnv('XDG_CONFIG_HOME', configured);
    await setLoginStart(true);
    expect(mkdir).toHaveBeenCalledWith(`${expected}/autostart`, { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      `${expected}/autostart/saika-vista.desktop`,
      expect.stringContaining('[Desktop Entry]'),
      { mode: 0o600 },
    );
    await setLoginStart(false);
    expect(unlink).toHaveBeenCalledWith(`${expected}/autostart/saika-vista.desktop`);
  });
});
