// SPDX-License-Identifier: MIT
// @vitest-environment node
import { readFileSync } from 'node:fs';

import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { settings, logger } = vi.hoisted(() => ({
  settings: { NEXT_PUBLIC_WEB_VITALS: true },
  logger: { info: vi.fn(), flush: vi.fn() },
}));
vi.mock('@/shared/config/env', () => ({ publicEnv: settings }));
vi.mock('@/shared/telemetry/server/logger', () => ({ logger }));
vi.mock('next/server', () => ({ after: (callback: () => void) => callback() }));

import { POST } from '@/app/api/vitals/route.server';

const operation = JSON.parse(readFileSync(new URL('../../contracts/openapi.json', import.meta.url), 'utf8')).paths[
  '/api/vitals/'
].post;
const metric = { name: 'LCP', value: 123, rating: 'good', id: 'sample' };
const payloadSchema = z.fromJSONSchema(operation.requestBody.content['application/json'].schema);
const errorSchema = z.fromJSONSchema(operation.responses['400'].content['application/json'].schema);
function request(body: string, origin = 'https://docs.example.test') {
  return new Request('https://docs.example.test/api/vitals/', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  settings.NEXT_PUBLIC_WEB_VITALS = true;
});

it.each(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])(
  'accepts the documented %s metric with an empty 204 response',
  async (name) => {
    const payload = { ...metric, name };
    expect(payloadSchema.parse(payload)).toEqual(payload);
    const response = await POST(request(JSON.stringify(payload)));
    expect(operation.responses).toHaveProperty(String(response.status));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(logger.info).toHaveBeenCalledExactlyOnceWith('web_vital', payload);
    expect(logger.flush).toHaveBeenCalledOnce();
  },
);

it.each([{ name: 'unknown' }, { value: -1 }, { rating: 'unknown' }, { id: 'x'.repeat(101) }, { extra: true }])(
  'rejects payloads outside the declared schema: %j',
  async (change) => {
    const payload = { ...metric, ...change };
    expect(payloadSchema.safeParse(payload).success).toBe(false);
    const response = await POST(request(JSON.stringify(payload)));
    expect(response.status).toBe(400);
    expect(errorSchema.parse(await response.json())).toEqual({ title: 'Invalid metric' });
    expect(logger.info).not.toHaveBeenCalled();
  },
);

it.each(['{', 'x'.repeat(2049)])('rejects unreadable and oversized JSON', async (body) => {
  const response = await POST(request(body));
  expect(response.status).toBe(400);
  expect(errorSchema.parse(await response.json())).toEqual({ title: 'Invalid metric' });
});

it('returns the documented empty 403 for another origin and ignores input when disabled', async () => {
  const denied = await POST(request(JSON.stringify(metric), 'https://other.example.test'));
  expect(operation.responses).toHaveProperty('403');
  expect(denied.status).toBe(403);
  expect(await denied.text()).toBe('');
  settings.NEXT_PUBLIC_WEB_VITALS = false;
  const disabled = await POST(request('{', 'https://other.example.test'));
  expect(disabled.status).toBe(204);
  expect(await disabled.text()).toBe('');
  expect(logger.info).not.toHaveBeenCalled();
});
