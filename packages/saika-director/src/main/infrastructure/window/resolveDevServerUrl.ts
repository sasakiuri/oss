// SPDX-License-Identifier: MIT

/** Returns the Vite development server only for unpackaged application runs. */
export function resolveDevServerUrl(isPackaged: boolean, devServerUrl: string | undefined): string | null {
  return !isPackaged && devServerUrl ? devServerUrl : null;
}
