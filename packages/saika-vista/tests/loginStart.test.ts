// SPDX-License-Identifier: MIT
import { mkdir, unlink, writeFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setLoginStart } from '../src/main/loginStart';

const app = vi.hoisted(() => ({
  isPackaged: true,
  getPath: vi.fn(() => '/opt/saika-vista'),
  setLoginItemSettings: vi.fn(),
  getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
}));
vi.mock('electron', () => ({ app }));
vi.mock('node:os', () => ({ homedir: () => '/home/vista-test' }));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  app.isPackaged = true;
  vi.stubEnv('APPIMAGE', undefined);
});
afterEach(() => vi.unstubAllEnvs());

it('rejects login startup in a development build without changing the OS setting', async () => {
  app.isPackaged = false;
  await expect(setLoginStart(true)).rejects.toThrow('Login startup is available in the installed application');
  expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  expect(mkdir).not.toHaveBeenCalled();
  expect(writeFile).not.toHaveBeenCalled();
  expect(unlink).not.toHaveBeenCalled();
});

describe.skipIf(process.platform === 'linux')('Native login startup setting', () => {
  it.each([true, false])('confirms that the OS applied openAtLogin=%s', async (enabled) => {
    app.getLoginItemSettings.mockReturnValue({ openAtLogin: enabled });
    await setLoginStart(enabled);
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: enabled, path: '/opt/saika-vista' });
    expect(app.getPath).toHaveBeenCalledWith('exe');
    expect(app.getLoginItemSettings).toHaveBeenCalledOnce();
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(unlink).not.toHaveBeenCalled();
  });

  it.each([true, false])('reports when the OS did not apply openAtLogin=%s', async (enabled) => {
    app.getLoginItemSettings.mockReturnValue({ openAtLogin: !enabled });
    await expect(setLoginStart(enabled)).rejects.toThrow(
      'The operating system did not apply the login startup setting',
    );
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: enabled, path: '/opt/saika-vista' });
  });
});

describe.skipIf(process.platform !== 'linux')('Linux login startup location', () => {
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
