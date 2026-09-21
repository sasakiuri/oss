import path from 'node:path';

import { expect, it } from 'vitest';

import { renderContent, renderSearchDocuments } from '@/lib/content/render';
import { createContentRepository } from '@/lib/content/repository';
import { parseSearchDocuments } from '@/lib/search';

it('renders every committed article with a valid target for every TOC link', async () => {
  const repository = createContentRepository(path.join(process.cwd(), 'content'));
  const articles = await repository.listSources('articles');
  expect(articles.length).toBeGreaterThan(0);
  let checkedHeadings = 0;
  for (const article of articles) {
    const rendered = await renderContent(article);
    const document = new DOMParser().parseFromString(rendered.html, 'text/html');
    for (const item of rendered.tableOfContents) {
      expect(document.getElementById(item.id)?.tagName, `${article.slug}: ${item.id}`).toBe(`H${item.level}`);
      checkedHeadings++;
    }
  }
  expect(checkedHeadings).toBeGreaterThan(0);
}, 30_000);

it('makes every species in the field guide navigable by heading and preserves its fragment links', async () => {
  const repository = createContentRepository(path.join(process.cwd(), 'content'));
  const article = await repository.read('articles', '1403693668');
  expect(article).not.toBeNull();
  const rendered = await renderContent(article!);
  document.body.innerHTML = rendered.html;
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);

  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    const fragment = link.getAttribute('href')!.slice(1);
    // Footnotes may use literal percent-encoded IDs; browsers try those before decoding.
    const target = document.getElementById(fragment) ?? document.getElementById(decodeURIComponent(fragment));
    expect(target).not.toBeNull();
  }

  const species = [...document.querySelectorAll('div.flex > div > h4')];
  expect(species).toHaveLength(48);
  const searchDocuments = await renderSearchDocuments(article!);
  for (const heading of species) {
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveAccessibleName(heading.textContent!);
    expect(searchDocuments).toContainEqual(
      expect.objectContaining({
        id: `/articles/1403693668/#${encodeURIComponent(heading.id)}`,
        section: heading.textContent,
      }),
    );
  }
  expect(document.getElementById('マガモ')).toHaveAccessibleName('マガモ');
  expect(document.getElementById('hoshihajiro')).toHaveAccessibleName('ホシハジロ');
  const martenDescription = document.getElementById('テン')?.nextElementSibling;
  expect(martenDescription?.querySelector('a')).toHaveTextContent('ウィキペディア：テン');
  expect(martenDescription?.querySelector('em')).toHaveTextContent('Martes melampus');
  expect(martenDescription).not.toHaveTextContent('**テン**');
});

it('gives the duck comparison illustrations text explanations and an explicit light canvas', async () => {
  const repository = createContentRepository(path.join(process.cwd(), 'content'));
  const article = await repository.read('articles', '1403693668');
  document.body.innerHTML = (await renderContent(article!)).html;
  const illustrations = [...document.querySelectorAll<HTMLImageElement>('img.content-illustration')];
  expect(illustrations).toHaveLength(2);
  expect(illustrations[0]).toHaveAccessibleName(/陸ガモは尾が水面より上.*海ガモは尾が水面近く/);
  expect(illustrations[0]?.closest('figure')?.querySelector('figcaption')).toHaveTextContent(
    '陸ガモと海ガモの尾の比較',
  );
  const description = document.getElementById(illustrations[1]!.getAttribute('aria-details')!);
  for (const species of ['マガモ', 'カルガモ', 'コガモ', 'オナガガモ', 'ヒドリガモ', 'ヨシガモ', 'ハシビロガモ']) {
    expect(description).toHaveTextContent(species);
  }
  expect(description).toHaveTextContent('幅広い黒い嘴');
  expect(illustrations.every((image) => image.getAttribute('src')?.startsWith('/content/articles/1403693668/'))).toBe(
    true,
  );
});

it('associates every skill-test deduction with its column, license and task across row spans', async () => {
  const repository = createContentRepository(path.join(process.cwd(), 'content'));
  const article = await repository.read('articles', '1415891983');
  document.body.innerHTML = (await renderContent(article!)).html;
  const table = document.getElementById('skills-license')!.closest('table')!;
  expect(table).toHaveAccessibleName('別表第1　技能試験要領');
  expect([...table.tBodies].map((body) => body.rows.length)).toEqual([5, 5, 44, 12]);
  const columns = [...table.tHead!.rows[0]!.cells];

  for (const body of table.tBodies) {
    // Expand the visual row spans to verify each cell's authored header references.
    const grid: HTMLTableCellElement[][] = Array.from(body.rows, () => []);
    for (const [rowIndex, row] of [...body.rows].entries()) {
      let column = 0;
      for (const cell of row.cells) {
        while (grid[rowIndex]![column]) column++;
        for (let offset = 0; offset < cell.rowSpan; offset++) {
          expect(grid[rowIndex + offset]).toBeDefined();
          grid[rowIndex + offset]![column] = cell;
        }
        column++;
      }
    }
    for (const row of grid) {
      expect(row).toHaveLength(4);
      expect(row[0]).toHaveAttribute('scope', 'rowgroup');
      expect(row[1]?.tagName).toBe('TH');
      for (const column of [2, 3]) {
        const headers = row[column]!.headers.split(' ');
        expect(headers).toEqual([columns[column]!.id, row[0]!.id, row[1]!.id]);
        expect(headers.map((id) => document.getElementById(id)?.tagName)).toEqual(['TH', 'TH', 'TH']);
      }
    }
  }

  const speciesTable = document.getElementById('species-net')!.closest('table')!;
  expect(speciesTable).toHaveAccessibleName('表第2　鳥獣の判別に用いる鳥獣の種類');
  expect([...speciesTable.tBodies].map((body) => body.rows.length)).toEqual([2, 2, 2, 2]);
  for (const body of speciesTable.tBodies) {
    const license = body.querySelector('th[scope="rowgroup"]')!;
    for (const row of body.rows) {
      const category = row.querySelector('th[scope="row"]')!;
      expect(row.querySelector('td')?.headers.split(' ')).toEqual([license.id, category.id]);
    }
  }
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
});

it.each(['articles', 'news'] as const)(
  'indexes all committed %s with valid page and section destinations',
  async (type) => {
    const repository = createContentRepository(path.join(process.cwd(), 'content'));
    const sources = await repository.listSources(type);
    const documents = parseSearchDocuments((await Promise.all(sources.map(renderSearchDocuments))).flat());
    expect(documents.filter((document) => !document.id.includes('#'))).toHaveLength(sources.length);
    for (const source of sources) {
      const rendered = await renderContent(source);
      const page = new DOMParser().parseFromString(rendered.html, 'text/html');
      const href = `/${source.type}/${source.slug}/`;
      for (const document of documents.filter((document) => document.id.startsWith(`${href}#`))) {
        const id = decodeURIComponent(document.id.slice(href.length + 1));
        expect(page.getElementById(id)).not.toBeNull();
      }
    }
  },
  30_000,
);
