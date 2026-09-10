// SPDX-License-Identifier: MIT
import { mkdir, writeFile } from 'node:fs/promises';

import { publicEnv, readServerEnv } from '../src/shared/config/env';
import { securityHeaders } from '../src/shared/config/security';

const headers = securityHeaders(publicEnv, readServerEnv());
await mkdir('out', { recursive: true });
await writeFile(
  'out/_headers',
  `/*\n${headers.map(({ key, value }) => `  ${key}: ${value}`).join('\n')}\n\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
);
await writeFile(
  'out/nginx-headers.conf',
  `${headers.map(({ key, value }) => `add_header ${key} "${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}" always;`).join('\n')}\n`,
);
console.log('Generated static hosting security headers.');
