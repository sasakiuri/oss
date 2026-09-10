// SPDX-License-Identifier: MIT
import 'server-only';
import { cookies } from 'next/headers';
import type { z } from 'zod';

import { readServerEnv } from '../../config/env';
import { ApiError, apiPath, fetchJson } from '../http';

export async function serverApi<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}) {
  const env = readServerEnv();
  if (!env.API_BASE_URL) throw new ApiError(503, 'The API backend is not configured.', 'backend_disabled');
  const headers = new Headers(init.headers);
  headers.set('Cookie', (await cookies()).toString());
  return fetchJson(`${env.API_BASE_URL.replace(/\/$/, '')}/api${apiPath(path)}`, schema, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
