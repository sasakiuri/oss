// SPDX-License-Identifier: MIT
import { readFile } from 'node:fs/promises';

import { files } from './lib/artifact.mjs';

const contract = JSON.parse(await readFile('contracts/openapi.json', 'utf8'));
const declared = new Set(
  Object.entries(contract.paths).flatMap(([route, methods]) =>
    Object.keys(methods)
      .filter((method) => /^(get|post|put|delete|patch|head|options)$/.test(method))
      .map((method) => `${method.toUpperCase()} ${route}`),
  ),
);
const implemented = new Set();
for (const file of (await files('src/app/api')).filter((file) => /\/route(?:\.server)?\.ts$/.test(file))) {
  const route = `/api/${file.replace(/\/route(?:\.server)?\.ts$/, '').replace(/\[([^\]]+)\]/g, '{$1}')}/`;
  const source = await readFile(`src/app/api/${file}`, 'utf8');
  const methods = [...source.matchAll(/export (?:async )?function (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g)].map(
    (match) => match[1],
  );
  if (!methods.length) throw new Error(`No explicit HTTP method found in ${file}`);
  for (const method of methods) {
    const operation = `${method} ${route}`;
    if (implemented.has(operation)) throw new Error(`Duplicate route: ${operation}`);
    if (!declared.has(operation)) throw new Error(`Missing OpenAPI operation: ${operation}`);
    implemented.add(operation);
  }
}
for (const operation of declared)
  if (!implemented.has(operation)) throw new Error(`OpenAPI operation has no route: ${operation}`);
console.log(`Verified ${implemented.size} Next.js route operations against OpenAPI.`);
