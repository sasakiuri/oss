import { createHash } from 'node:crypto';

import { searchIndexFormat, searchIndexFormatHeader, searchIndexRevisionHeader } from '../search-index-format';
import { searchDocumentsSchema } from './schemas';
import type { SearchDocument } from './types';

/** Keep the legacy array body while explicitly identifying its format and exact content. */
export function createSearchIndexResponse(documents: readonly SearchDocument[]): Response {
  const body = JSON.stringify(searchDocumentsSchema.parse(documents));
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      [searchIndexFormatHeader]: searchIndexFormat,
      [searchIndexRevisionHeader]: createHash('sha256').update(body).digest('hex'),
    },
  });
}
