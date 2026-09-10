// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const font = fileURLToPath(new URL('assets/fonts/NotoSansJP.ttf', root));
const checksum = createHash('sha256')
  .update(await readFile(font))
  .digest('hex');
if (checksum !== 'c2f3b4d463500a2ddcd3849cded1fceeb9fd6d1c32e6cbecd568453ba50fc68f')
  throw new Error('The pinned Japanese font has changed. Review its source and license.');
const output = new URL('public/', root);
await mkdir(output, { recursive: true });
const icon = await readFile(new URL('src/app/icon.svg', root));
const favicon = await sharp(icon).resize(32, 32).png().toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 32;
ico[7] = 32;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(favicon.length, 14);
ico.writeUInt32LE(22, 18);
await writeFile(new URL('favicon.ico', output), Buffer.concat([ico, favicon]));
for (const size of [192, 512, 180]) {
  const image = sharp(icon).resize(size, size);
  // Home-screen masks need an opaque background; the mark fits inside the central 80% circle.
  if (size === 512 || size === 180) image.flatten({ background: '#164b3e' });
  await image.png().toFile(fileURLToPath(new URL(size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`, output)));
}
const shareIcon = await sharp(icon).resize(256, 256).png().toBuffer();
const title = await sharp({
  text: {
    text: '<span foreground="#20201e" weight="bold">Saika Docs</span>',
    font: 'Noto Sans JP 76',
    fontfile: font,
    rgba: true,
    width: 700,
  },
})
  .png()
  .toBuffer();
const subtitle = await sharp({
  text: {
    text: '<span foreground="#62615b">日本語マニュアルと技術資料</span>',
    font: 'Noto Sans JP 36',
    fontfile: font,
    rgba: true,
    width: 700,
  },
})
  .png()
  .toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#fcfcfb' } })
  .composite([
    { input: shareIcon, left: 80, top: 187 },
    { input: title, left: 392, top: 230 },
    { input: subtitle, left: 396, top: 344 },
  ])
  .png()
  .toFile(fileURLToPath(new URL('opengraph-image.png', output)));
await writeFile(
  new URL('asset-manifest.json', output),
  `${JSON.stringify({ font: 'Noto Sans JP', license: 'OFL-1.1', sha256: checksum }, null, 2)}\n`,
);
console.log('Generated Japanese Open Graph image and application icons.');
