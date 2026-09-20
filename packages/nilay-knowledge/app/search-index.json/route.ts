import { getSearchDocuments } from '@/lib/content/server';

export const dynamic = 'force-static';

export async function GET() {
  return Response.json(await getSearchDocuments());
}
