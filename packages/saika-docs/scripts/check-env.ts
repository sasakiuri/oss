// SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';

import { publicEnvSchema, serverEnvSchema } from '../src/shared/config/env';

const expected = [...Object.keys(publicEnvSchema.shape), ...Object.keys(serverEnvSchema.shape)].sort();
const sample = (await readFile('.env.example', 'utf8'))
  .split('\n')
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => line.split('=')[0])
  .sort();
const turbo = JSON.parse(await readFile('turbo.json', 'utf8')) as { tasks: Record<string, { env?: string[] }> };
for (const [name, actual] of [
  ['.env.example', sample],
  ['turbo build', turbo.tasks.build?.env],
  ['turbo dev', turbo.tasks.dev?.env],
  ['turbo start', turbo.tasks.start?.env],
] as const) {
  const missing = expected.filter((key) => !actual?.includes(key));
  if (missing.length) throw new Error(`${name} is missing: ${missing.join(', ')}`);
}
console.log(`Validated ${expected.length} environment declarations and Turbo cache inputs.`);
