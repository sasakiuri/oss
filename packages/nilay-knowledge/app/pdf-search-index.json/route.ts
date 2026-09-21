import path from 'node:path';

import { createPdfSearchIndex } from '@/lib/content/pdf-search';
import { createContentRepository } from '@/lib/content/repository';
import { contentTypes } from '@/lib/content/types';

export const dynamic = 'force-static';
export const runtime = 'nodejs';

export async function GET() {
  const repository = createContentRepository(path.join(process.cwd(), 'content'));
  const sources = (await Promise.all(contentTypes.map((type) => repository.listSources(type)))).flat();
  const { documents, report } = await createPdfSearchIndex(sources, path.join(process.cwd(), 'content'));
  if (report.pagesWithoutText.length > 0) {
    console.warn(
      `PDF search: ${report.pagesWithoutText.length}/${report.pages} pages have no extractable text and are excluded; OCR is not performed.`,
      report.pagesWithoutText,
    );
  }
  return Response.json(documents);
}
