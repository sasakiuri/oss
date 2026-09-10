// SPDX-License-Identifier: MIT
import 'server-only';
import { after } from 'next/server';

import { logger } from '../../telemetry/server/logger';
import { ApiError } from '../http';

export async function apiResponse(operation: () => Promise<unknown>, cache: 'public' | 'private' = 'public') {
  const requestId = crypto.randomUUID();
  try {
    const result = await operation();
    logger.info('api_success', { request_id: requestId });
    return Response.json(result, {
      headers: {
        'Cache-Control':
          cache === 'public' ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=60' : 'private, no-store',
        'X-Request-Id': requestId,
      },
    });
  } catch (error) {
    const status =
      error instanceof ApiError
        ? error.status
        : error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name)
          ? 504
          : 502;
    if (status >= 500) logger.error('api_failure', error, { request_id: requestId, status });
    else logger.warn('api_failure', { request_id: requestId, status });
    return Response.json(
      {
        title: error instanceof ApiError ? error.message : 'An upstream service is unavailable.',
        status,
        code: error instanceof ApiError ? error.code : 'upstream_failure',
      },
      { status, headers: { 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId } },
    );
  } finally {
    after(() => logger.flush());
  }
}
