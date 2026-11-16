// SPDX-License-Identifier: MIT

/** Paths that a Vista display PC serves to its controlling Vista. Lane and Director do not use them. */
export const VISTA_DISPLAY_PATH = {
  state: '/vista/v1/display/state',
  register: '/vista/v1/display/register',
  apply: '/vista/v1/display/apply',
  frame: '/vista/v1/display/frame',
  identify: '/vista/v1/display/identify',
  remove: '/vista/v1/display/remove',
  release: '/vista/v1/display/release',
} as const;
