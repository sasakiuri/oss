// SPDX-License-Identifier: MIT
'use client';
import type { z } from 'zod';

import { withBasePath } from '../config/site';

import { apiPath, fetchJson } from './http';

export function browserApi<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}) {
  return fetchJson(withBasePath(`/api${apiPath(path)}`), schema, { ...init, credentials: 'same-origin' });
}
