// SPDX-License-Identifier: MIT
import { after } from 'next/server';
import { z } from 'zod';

import { readLimitedBody } from '@/shared/api/http';
import { publicEnv } from '@/shared/config/env';
import { logger } from '@/shared/telemetry/server/logger';

const metricSchema = z
  .object({
    name: z.enum(['CLS', 'FCP', 'INP', 'LCP', 'TTFB']),
    value: z.number().finite().nonnegative(),
    rating: z.enum(['good', 'needs-improvement', 'poor']),
    id: z.string().max(100),
  })
  .strict();
export async function POST(request: Request) {
  if (!publicEnv.NEXT_PUBLIC_WEB_VITALS) return new Response(null, { status: 204 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 });
  try {
    const payload = metricSchema.parse(
      JSON.parse(new TextDecoder().decode(await readLimitedBody(request.body, 2048, AbortSignal.timeout(5000)))),
    );
    logger.info('web_vital', payload);
    after(() => logger.flush());
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ title: 'Invalid metric' }, { status: 400 });
  }
}
