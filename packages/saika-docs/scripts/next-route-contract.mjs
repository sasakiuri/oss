// SPDX-License-Identifier: MIT
import { readFile, writeFile } from 'node:fs/promises';

import { files } from './lib/artifact.mjs';

const paths = {};
const ids = new Set();
for (const file of (await files('src/app/api')).filter((file) => /\/route(?:\.server)?\.ts$/.test(file))) {
  const route = `/api/${file.replace(/\/route(?:\.server)?\.ts$/, '').replace(/\[([^\]]+)\]/g, '{$1}')}/`;
  const source = await readFile(`src/app/api/${file}`, 'utf8');
  const methods = [...source.matchAll(/export (?:async )?function (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g)].map(
    (match) => match[1],
  );
  if (!methods.length) throw new Error(`No explicit HTTP method found in ${file}`);
  paths[route] = {};
  for (const method of methods) {
    const id = `${method.toLowerCase()}_${route.replace(/[^a-z0-9]+/gi, '_')}`;
    if (ids.has(id)) throw new Error('Duplicate operation ID');
    ids.add(id);
    paths[route][method.toLowerCase()] = {
      operationId: id,
      responses: { default: { description: 'See the route-specific validated response and Problem contract' } },
    };
  }
}
const expected =
  JSON.stringify(
    { openapi: '3.1.0', info: { title: 'Saika Next.js route inventory', version: '1.0.0' }, paths },
    null,
    2,
  ) + '\n';
if (process.argv.includes('--write')) await writeFile('contracts/next-routes.openapi.json', expected);
else if ((await readFile('contracts/next-routes.openapi.json', 'utf8')) !== expected)
  throw new Error('Next.js API route inventory changed. Review and regenerate the contract.');
console.log(`Verified ${ids.size} Next.js route operations.`);
