// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rm, mkdir, readFile, writeFile } from 'node:fs/promises';

import { chromium } from '@playwright/test';

// @ts-expect-error Shared artifact helpers.
import { sourceIdentity } from './lib/artifact.mjs';
// @ts-expect-error Shared Node script has no declaration file.
import { startServer } from './server.mjs';

const server = await startServer(5182);
const browser = await chromium.launch({
  args: process.env.PLAYWRIGHT_DISABLE_SOFTWARE_RASTERIZER === '1' ? ['--disable-software-rasterizer'] : [],
});
const output = 'dist/docs';
await rm(output, { recursive: true, force: true });
await mkdir(`${output}/diagrams`, { recursive: true });
try {
  const page = await browser.newPage({
    httpCredentials: server.httpCredentials,
    viewport: { width: 1200, height: 900 },
  });
  await page.goto(`${server.url}/print/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (const figure of await page.locator('[data-diagram-source]').all()) {
    await figure.scrollIntoViewIfNeeded();
    await figure.locator('svg').waitFor({ timeout: 60_000 });
  }
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[data-diagram-state]')].every(
        (node) => node.getAttribute('data-diagram-state') === 'ready',
      ),
    undefined,
    { timeout: 60_000 },
  );
  await page.emulateMedia({ media: 'print' });
  const diagrams = await page.locator('[data-diagram-source]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      source: node.getAttribute('data-diagram-source') ?? '',
      svg: node.querySelector('svg')?.outerHTML ?? '',
    })),
  );
  for (const [index, diagram] of diagrams.entries()) {
    if (!diagram.svg) throw new Error('A Mermaid diagram did not render');
    const hash = createHash('sha256').update(diagram.source.trim()).digest('hex');
    await writeFile(`${output}/diagrams/${hash}.svg`, diagram.svg);
    await page
      .locator('[data-diagram-source] svg')
      .nth(index)
      .screenshot({ path: `${output}/diagrams/${hash}.png` });
  }
  await page.evaluate(() => {
    const sections = [...document.querySelectorAll<HTMLElement>('[data-document-href]')];
    const targets = new Map(sections.map((section, index) => [section.dataset.documentHref, `chapter-${index}`]));
    for (const section of sections) {
      const prefix = targets.get(section.dataset.documentHref)!;
      section.id = prefix;
      for (const element of section.querySelectorAll('[id]'))
        if (!element.closest('svg')) element.id = `${prefix}-${element.id}`;
    }
    for (const link of document.querySelectorAll<HTMLAnchorElement>('.print-book a[href]')) {
      const url = new URL(link.href, location.href);
      const target = targets.get(url.pathname);
      if (url.origin === location.origin && target)
        link.setAttribute('href', `#${target}${url.hash ? `-${decodeURIComponent(url.hash.slice(1))}` : ''}`);
    }
    const toc = document.createElement('ol');
    for (const section of sections) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${section.id}`;
      link.textContent = section.querySelector('h2')?.textContent ?? section.id;
      item.append(link);
      toc.append(item);
    }
    document.querySelector('.print-book')?.insertBefore(toc, sections[0]!);
  });
  // Embed CSS, fonts and diagrams so the HTML artifact has no server dependency.
  const css: string[] = [];
  for (const href of await page
    .locator('link[rel=stylesheet]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href))) {
    const response = await fetch(href, { headers: server.headers });
    if (!response.ok) throw new Error(`Stylesheet failed: ${response.status}`);
    let source = await response.text();
    for (const match of [...source.matchAll(/url\(["']?([^\s)"']+)["']?\)/g)]) {
      const asset = match[1];
      if (!asset || asset.startsWith('data:')) continue;
      const url = new URL(asset, href);
      const result = await fetch(url, { headers: url.origin === new URL(server.url).origin ? server.headers : {} });
      if (!result.ok) throw new Error(`Font/asset failed: ${result.status}`);
      source = source.replace(
        match[0],
        `url(data:${result.headers.get('content-type') ?? 'application/octet-stream'};base64,${Buffer.from(await result.arrayBuffer()).toString('base64')})`,
      );
    }
    css.push(source);
  }
  // Freeze every rendered image to its selected bytes. Removing srcset prevents later network access.
  for (const image of await page.locator('.print-book img').all()) {
    const src = await image.evaluate((node) => (node as HTMLImageElement).currentSrc || (node as HTMLImageElement).src);
    if (!src || src.startsWith('data:')) continue;
    const response = await page.request.get(src);
    if (!response.ok()) throw new Error(`Image failed: ${response.status()}`);
    const data = `data:${response.headers()['content-type'] ?? 'application/octet-stream'};base64,${(await response.body()).toString('base64')}`;
    await image.evaluate((node, value) => {
      node.setAttribute('src', value);
      node.removeAttribute('srcset');
      node.removeAttribute('loading');
      node
        .closest('picture')
        ?.querySelectorAll('source')
        .forEach((source) => source.remove());
    }, data);
  }
  let book = await page.locator('.print-book').evaluate((node) => node.outerHTML);
  // WeasyPrint does not render SVG foreignObject labels. Reuse browser-rendered
  // PNGs in the standalone HTML while retaining vector diagrams in Chromium PDF.
  for (const diagram of diagrams) {
    const hash = createHash('sha256').update(diagram.source.trim()).digest('hex');
    const png = (await readFile(`${output}/diagrams/${hash}.png`)).toString('base64');
    book = book.replace(diagram.svg, `<img alt="文書内の図" src="data:image/png;base64,${png}">`);
  }
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Saika マニュアル</title><style>${css.join('\n')}</style></head><body>${book}</body></html>`;
  await writeFile(`${output}/saika-manual.html`, html);
  if (!process.argv.includes('--html'))
    await page.pdf({
      tagged: true,
      outline: true,
      path: `${output}/saika-manual.pdf`,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:9px;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  if (process.argv.includes('--weasyprint'))
    execFileSync('weasyprint', [`${output}/saika-manual.html`, `${output}/saika-manual-weasyprint.pdf`], {
      stdio: 'inherit',
    });
  if (process.argv.includes('--pandoc'))
    execFileSync(
      'pandoc',
      [`${output}/saika-manual.html`, '--standalone', '--toc', '-o', `${output}/saika-manual.docx`],
      { stdio: 'inherit' },
    );
  const version = (JSON.parse(await readFile('package.json', 'utf8')) as { version: string }).version;
  await writeFile(
    `${output}/build.json`,
    JSON.stringify(
      {
        ...(await sourceIdentity()),
        version,
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
        browser: browser.version(),
        diagrams: diagrams.length,
      },
      null,
      2,
    ),
  );
  console.log(
    `Generated offline HTML${process.argv.includes('--html') ? '' : ' and PDF'} with ${diagrams.length} diagrams.`,
  );
} finally {
  await browser.close();
  server.close();
}
