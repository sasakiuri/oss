// SPDX-License-Identifier: MIT
'use client';
import type { z } from 'zod';

import { withBasePath } from '../config/site';

import { safeReturnTo } from './auth';
import { ApiError, apiPath, fetchJson } from './http';

export async function browserApi<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestInit & { redirectOnUnauthorized?: string } = {},
  prefix = '/backend',
) {
  const { redirectOnUnauthorized, ...init } = options;
  const headers = new Headers(options.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method ?? 'GET').toUpperCase())) {
    const token = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('saika_csrf='))
      ?.slice('saika_csrf='.length);
    if (token) headers.set('X-CSRF-Token', decodeURIComponent(token));
  }
  try {
    return await fetchJson(withBasePath(`${prefix}${apiPath(path)}`), schema, {
      ...init,
      credentials: 'same-origin',
      headers,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && redirectOnUnauthorized && prefix === '/backend')
      window.location.assign(withBasePath(safeReturnTo(redirectOnUnauthorized)));
    throw error;
  }
}
