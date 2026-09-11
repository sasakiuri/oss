// SPDX-License-Identifier: MIT
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { app } from 'electron';

import { linuxAutostartEntry } from './linuxAutostart';

export async function setLoginStart(enabled: boolean): Promise<void> {
  if (!app.isPackaged) throw new Error('Login startup is available in the installed application');
  if (process.platform === 'linux') {
    const configured = process.env.XDG_CONFIG_HOME;
    const configHome = configured && isAbsolute(configured) ? configured : join(homedir(), '.config');
    const directory = join(configHome, 'autostart');
    const file = join(directory, 'saika-vista.desktop');
    if (enabled) {
      const executable = process.env.APPIMAGE ?? app.getPath('exe');
      const entry = linuxAutostartEntry(executable);
      await mkdir(directory, { recursive: true });
      await writeFile(file, entry, { mode: 0o600 });
    } else
      await unlink(file).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
  } else {
    app.setLoginItemSettings({ openAtLogin: enabled, path: app.getPath('exe') });
    if (app.getLoginItemSettings().openAtLogin !== enabled)
      throw new Error('The operating system did not apply the login startup setting');
  }
}
