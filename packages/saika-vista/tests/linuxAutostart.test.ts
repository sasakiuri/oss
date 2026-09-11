// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { linuxAutostartEntry } from '../src/main/linuxAutostart';

describe('Linux login startup entry', () => {
  const launcher = String.raw`Exec="/bin/sh" "-c" "exec \\"\\$1\\"" "saika-vista"`;

  it('passes the AppImage path separately from the fixed launcher script', () => {
    expect(linuxAutostartEntry('/home/operator/Saika Vista.AppImage')).toBe(
      `[Desktop Entry]\nType=Application\nName=Saika Vista\n${launcher} "/home/operator/Saika Vista.AppImage"\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`,
    );
  });

  it.each([
    ['/opt/Vista$demo.AppImage', String.raw`/opt/Vista\\$demo.AppImage`],
    ['/opt/Vista`demo.AppImage', '/opt/Vista\\\\`demo.AppImage'],
    ['/opt/Vista"demo.AppImage', String.raw`/opt/Vista\\"demo.AppImage`],
    ['/opt/Vista\\demo.AppImage', String.raw`/opt/Vista\\\\demo.AppImage`],
    ['/opt/Vista%f-%U-100%.AppImage', '/opt/Vista%%f-%%U-100%%.AppImage'],
    ['/opt/Vista=demo.AppImage', '/opt/Vista=demo.AppImage'],
    ['/opt/Vista$(printf injected);demo.AppImage', String.raw`/opt/Vista\\$(printf injected);demo.AppImage`],
  ])('preserves literal characters in %s through both Desktop Entry escape layers', (path, encoded) => {
    expect(linuxAutostartEntry(path).split('\n')).toContain(`${launcher} "${encoded}"`);
  });

  it.each(['/opt/Vista\nExec=other.AppImage', '/opt/Vista\rHidden=true.AppImage'])(
    'rejects line breaks before a startup file can be written: %j',
    (path) => {
      expect(() => linuxAutostartEntry(path)).toThrow('not supported');
    },
  );
});
