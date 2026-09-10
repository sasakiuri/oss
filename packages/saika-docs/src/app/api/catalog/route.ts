// SPDX-License-Identifier: MIT
import { getCatalog } from '@/entities/catalog/server/repository';
import { cachePolicy } from '@/shared/config/query';

export const dynamic = 'force-static';
export function GET() {
  return Response.json(getCatalog(), { headers: { 'Cache-Control': cachePolicy.public } });
}
