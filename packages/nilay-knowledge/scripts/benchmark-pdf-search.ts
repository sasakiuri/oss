import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { createPdfSearchIndex } from '../lib/content/pdf-search';
import { createContentRepository } from '../lib/content/repository';
import { contentTypes } from '../lib/content/types';

async function main() {
  const output = process.argv[2];
  const contentDirectory = path.join(process.cwd(), 'content');
  const repository = createContentRepository(contentDirectory);
  const sources = (await Promise.all(contentTypes.map((type) => repository.listSources(type)))).flat();
  const started = performance.now();
  const result = await createPdfSearchIndex(sources, contentDirectory, {
    cacheDirectory: process.argv.includes('--no-cache') ? false : process.env.PDF_SEARCH_CACHE_DIRECTORY,
  });
  const report = {
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
    pipelineMs: performance.now() - started,
    peakRssKiB: process.resourceUsage().maxRSS,
    ...result.report,
  };
  if (output) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ...report, pagesWithoutText: report.pagesWithoutText.length }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
