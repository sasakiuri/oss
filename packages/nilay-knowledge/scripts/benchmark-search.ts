import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { createPdfSearchIndex } from '../lib/content/pdf-search';
import { renderSearchDocuments } from '../lib/content/render';
import { createContentRepository } from '../lib/content/repository';
import { contentTypes, type SearchDocument } from '../lib/content/types';
import { createSearchIndex, searchExcerpt } from '../lib/search';
import type { SearchScope } from '../lib/search-protocol';
import { createSearchSession } from '../lib/search-results';

async function main() {
  const output = process.argv[2];
  const root = path.join(process.cwd(), 'content');
  const repository = createContentRepository(root);
  const sources = (await Promise.all(contentTypes.map((type) => repository.listSources(type)))).flat();
  const content = (await Promise.all(sources.map(renderSearchDocuments))).flat();
  const pdf = (await createPdfSearchIndex(sources, root)).documents;
  const synthetic: SearchDocument[] = Array.from({ length: 500 }, (_, index) => ({
    id: `/content/assets/synthetic.pdf#page=${index + 1}`,
    type: 'pdf',
    title: 'Synthetic PDF',
    section: `${index + 1}ページ`,
    tags: [],
    text: '所持許可 申請書 USB 接続 印刷'.repeat(50),
  }));
  const indexes = {
    content: createSearchIndex(content),
    pdf: createSearchIndex(pdf),
    synthetic: createSearchIndex(synthetic),
  };
  const cases: { query: string; scope: SearchScope; dataset: keyof typeof indexes }[] = [
    { query: '所持許可', scope: 'all', dataset: 'content' },
    { query: 'PDF 申請', scope: 'articles', dataset: 'content' },
    { query: 'ＰＤＦ', scope: 'all', dataset: 'content' },
    { query: '所持許可 更新', scope: 'articles', dataset: 'content' },
    { query: '更新', scope: 'news', dataset: 'content' },
    { query: '銃砲所持許可申請書', scope: 'pdf', dataset: 'pdf' },
    { query: '申請', scope: 'pdf', dataset: 'pdf' },
    { query: '申請', scope: 'pdf', dataset: 'synthetic' },
  ];
  const measurements = cases.flatMap((entry) =>
    Array.from({ length: 3 }, (_, repetition) => {
      const measure = (bounded: boolean) => {
        const started = performance.now();
        const matches = indexes[entry.dataset].search(entry.query, {
          filter: (match) => entry.scope === 'all' || match.type === entry.scope,
        });
        let excerptCount = 0;
        const excerpt = (text: string, query: string) => {
          excerptCount += 1;
          return searchExcerpt(text, query);
        };
        let response: unknown;
        let firstExpandedMatches: number;
        if (bounded) {
          const session = createSearchSession(matches, entry.query, 1, new Map(), excerpt);
          const page = session.page();
          response = page;
          firstExpandedMatches = page.groups[0] ? Math.min(page.groups[0].totalMatches, 21) : 0;
        } else {
          // The previous worker prepared every excerpt before paginating document groups.
          const groups = new Map<string, { id: string; type: string; title: string; matches: unknown[] }>();
          for (const match of matches) {
            const id = String(match.id).split('#')[0]!;
            let group = groups.get(id);
            if (!group) {
              group = { id, type: match.type, title: String(match.title), matches: [] };
              groups.set(id, group);
            }
            group.matches.push({
              id: String(match.id),
              section: String(match.section),
              excerpt: excerpt(String(match.text), entry.query),
            });
          }
          response = {
            total: groups.size,
            totalMatches: matches.length,
            groups: [...groups.values()].slice(0, 20),
            nextOffset: groups.size > 20 ? 20 : null,
          };
          firstExpandedMatches = [...groups.values()][0]?.matches.length ?? 0;
        }
        return {
          firstResultMs: performance.now() - started,
          excerptCount,
          serializedMessageBytes: Buffer.byteLength(JSON.stringify(response)),
          firstExpandedMatches,
        };
      };
      if (repetition % 2) {
        const bounded = measure(true);
        return { ...entry, repetition, eagerBaseline: measure(false), bounded };
      }
      return { ...entry, repetition, eagerBaseline: measure(false), bounded: measure(true) };
    }),
  );
  const fixtures = JSON.parse(
    await readFile(path.join(process.cwd(), 'scripts/search-relevance-fixtures.json'), 'utf8'),
  ) as { query: string; scope: SearchScope; acceptable: string[]; topK: number }[];
  const relevance = fixtures.map((fixture) => {
    const matches = indexes[fixture.scope === 'pdf' ? 'pdf' : 'content'].search(fixture.query, {
      filter: (result) => fixture.scope === 'all' || result.type === fixture.scope,
    });
    const destinations = [...new Set(matches.map((match) => String(match.id).split('#')[0]!))];
    const ranks = fixture.acceptable.map((id) => destinations.indexOf(id) + 1).filter((rank) => rank > 0);
    return {
      ...fixture,
      ranks,
      hitAtK: ranks.some((rank) => rank <= fixture.topK),
      reciprocalRank: ranks.length ? 1 / Math.min(...ranks) : 0,
      topDestinations: destinations.slice(0, fixture.topK),
    };
  });
  const report = {
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
    dataset: {
      articleNewsSections: content.length,
      pdfPages: pdf.length,
      syntheticPages: 500,
      digest: createHash('sha256')
        .update(JSON.stringify([...content, ...pdf]))
        .digest('hex'),
    },
    measurements,
    relevance,
    meanReciprocalRank: relevance.reduce((sum, fixture) => sum + fixture.reciprocalRank, 0) / relevance.length,
  };
  if (output) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
