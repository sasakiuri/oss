// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { stat, readFile } from 'node:fs/promises';

import { JSDOM } from 'jsdom';

for (const file of process.argv.slice(2).length ? process.argv.slice(2) : ['dist/docs/saika-manual.pdf']) {
  const size = (await stat(file)).size;
  if (size < 100_000 || size > 50_000_000) throw new Error(`Unexpected PDF size: ${file}`);
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' });
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if (pages < 20 || pages > 1000) throw new Error(`Unexpected page count: ${file}`);
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8', maxBuffer: 10_000_000 });
  if (!text.includes('Saika') || !/[ぁ-んァ-ン一-龥]{5}/.test(text)) throw new Error(`Missing Japanese text: ${file}`);
  console.log(`${file}: ${pages} pages, ${size} bytes, Japanese text verified`);
}
const document = new JSDOM(await readFile('dist/docs/saika-manual.html', 'utf8')).window.document;
for (const image of document.querySelectorAll('img'))
  if (!image.src.startsWith('data:')) throw new Error('Standalone HTML still contains a network image');
if (document.querySelector('img[srcset], source[srcset], script[src], link[rel=stylesheet]'))
  throw new Error('Standalone HTML still has external dependencies');
