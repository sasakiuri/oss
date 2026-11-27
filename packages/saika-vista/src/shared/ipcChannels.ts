// SPDX-License-Identifier: MIT

/** IPC channels between Vista's main process and its preload script. */
export const VISTA_CHANNEL = {
  state: 'vista:state',
  command: 'vista:command',
  discover: 'vista:discover',
  audience: 'vista:audience',
  rendered: 'vista:rendered',
  /** Sent to the operator and audience windows when the state they show may have changed. */
  changed: 'vista:changed',
  updatesState: 'vista:updates-state',
  updatesCheck: 'vista:updates-check',
  updatesInstall: 'vista:updates-install',
  updatesChanged: 'vista:updates-changed',
} as const;
