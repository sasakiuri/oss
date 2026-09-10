// SPDX-License-Identifier: MIT
import { existsSync } from 'node:fs';
if (!process.env.CI && process.env.NODE_ENV !== 'production' && existsSync('.git')) {
  const { default: install } = await import('husky');
  install();
}
