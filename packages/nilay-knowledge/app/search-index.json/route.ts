import { createSearchIndexResponse } from '@/lib/content/search-index-response';
import { getSearchDocuments } from '@/lib/content/server';

export const dynamic = 'force-static';

export async function GET() {
  return createSearchIndexResponse(await getSearchDocuments());
}
