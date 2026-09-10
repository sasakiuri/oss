// SPDX-License-Identifier: MIT
import { getSearchDocuments } from '@/entities/document/server/repository';

export const dynamic = 'force-static';
export function GET() {
  return Response.json(getSearchDocuments());
}
