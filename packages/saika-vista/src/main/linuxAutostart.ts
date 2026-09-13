// SPDX-License-Identifier: MIT
export function linuxAutostartEntry(executable: string): string {
  if (/[\n\r]/.test(executable)) throw new Error('The application path is not supported for login startup');
  // Encode both Exec quoting and Desktop Entry string escaping in one pass.
  const quote = (argument: string) =>
    `"${argument.replace(/[\\"`$%]/g, (character) => {
      if (character === '%') return '%%';
      if (character === '\\') return '\\\\\\\\';
      return `\\\\${character}`;
    })}"`;
  // GLib checks the executable before expanding %% field codes. Keep the
  // launcher fixed and pass the AppImage path as data, never as shell source.
  const command = ['/bin/sh', '-c', 'exec "$1"', 'saika-vista', executable].map(quote).join(' ');
  return `[Desktop Entry]\nType=Application\nName=Saika Vista\nExec=${command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
}
