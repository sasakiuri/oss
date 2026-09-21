import path from 'node:path';

import { serveContentAsset } from '@/lib/content/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ path: string[] }>;
}

export async function GET(request: Request, context: Context) {
  const segments = (await context.params).path;
  return serveContentAsset(request, segments, path.join(process.cwd(), 'content'));
}

export const HEAD = GET;
