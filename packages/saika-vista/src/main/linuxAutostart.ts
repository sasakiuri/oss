// SPDX-License-Identifier: MIT
export function linuxAutostartEntry(executable: string): string {
  if (/[\n\r]/.test(executable)) throw new Error('The application path is not supported for login startup');
  // Quote an Exec argument first, then escape the Desktop Entry string value.
  const quote = (argument: string) =>
    `"${argument
      .replace(/([\\"`$])/g, '\\$1')
      .replace(/%/g, '%%')
      .replace(/\\/g, '\\\\')}"`;
  // GLib checks the executable before expanding %% field codes. Keep the
  // launcher fixed and pass the AppImage path as data, never as shell source.
  const command = ['/bin/sh', '-c', 'exec "$1"', 'saika-vista', executable].map(quote).join(' ');
  return `[Desktop Entry]\nType=Application\nName=Saika Vista\nExec=${command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
}
