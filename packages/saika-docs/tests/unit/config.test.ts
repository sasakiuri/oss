// SPDX-License-Identifier: MIT
// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseEnvironment, publicEnvSchema, serverEnvSchema } from '@/shared/config/env';
import { createQueryClient } from '@/shared/config/query';
import { securityHeaders } from '@/shared/config/security';
import { exclusiveEndDate, formatDate } from '@/shared/lib/date';
import { dateParam, positiveIntegerParam, stringParam, stringsParam } from '@/shared/lib/search-params';
import { structuredData } from '@/shared/lib/structured-data';
import { redact } from '@/shared/telemetry/redact';

describe('configuration and shared policies', () => {
  it('rejects invalid or inconsistent settings without exposing secret values', () => {
    expect.assertions(8);
    expect(() =>
      parseEnvironment(publicEnvSchema, { NEXT_PUBLIC_SITE_URL: 'https://name:secret@example.test' }),
    ).toThrow(/SITE_URL/);
    expect(() =>
      parseEnvironment(publicEnvSchema, {
        NEXT_PUBLIC_SITE_URL: 'https://example.test/docs',
        NEXT_PUBLIC_BASE_PATH: '/other',
      }),
    ).toThrow(/BASE_PATH/);
    expect(() => parseEnvironment(serverEnvSchema, { AXIOM_TOKEN: 'sensitive-token' })).toThrow(/AXIOM_TOKEN/);
    try {
      parseEnvironment(serverEnvSchema, { AXIOM_TOKEN: 'sensitive-token' });
    } catch (error) {
      expect(String(error)).not.toContain('sensitive-token');
    }
    expect(
      serverEnvSchema.safeParse({
        DOCS_OUTPUT: 'export',
        DOCS_PREVIEW_AUTH: '1',
        PREVIEW_AUTH_USER: 'u',
        PREVIEW_AUTH_PASSWORD: 'p',
      }).success,
    ).toBe(false);
    expect(serverEnvSchema.safeParse({ DOCS_PREVIEW_AUTH: '1' }).success).toBe(false);
    expect(publicEnvSchema.safeParse({ NEXT_PUBLIC_BASE_PATH: '//bad' }).success).toBe(false);
    expect(publicEnvSchema.parse({}).NEXT_PUBLIC_WEB_VITALS).toBe(false);
  });
  it('adds production CSP and HTTPS-only HSTS, with opt-in integration origins', () => {
    const server = serverEnvSchema.parse({});
    const headers = Object.fromEntries(
      securityHeaders(publicEnvSchema.parse({ NEXT_PUBLIC_SITE_URL: 'https://example.test' }), server, false).map(
        ({ key, value }) => [key, value],
      ),
    );
    expect(headers['Strict-Transport-Security']).toContain('max-age=');
    expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
    expect(headers['Content-Security-Policy']).not.toContain("'unsafe-eval'");
    expect(headers['Content-Security-Policy']).not.toContain('google-analytics');
    const local = securityHeaders(publicEnvSchema.parse({}), server, true);
    expect(local.some(({ key }) => key === 'Strict-Transport-Security')).toBe(false);
  });
  it('masks credentials and escapes executable structured data', () => {
    expect(redact({ authorization: 'Bearer key', nested: { password: 'p', harmless: 2 }, token: 't' })).toEqual({
      authorization: '[redacted]',
      nested: { password: '[redacted]', harmless: 2 },
      token: '[redacted]',
    });
    expect(structuredData({ title: '</script><script>alert(1)</script>' })).not.toContain('<');
  });
  it('uses Japanese calendar dates, exclusive all-day ends and validated query values', () => {
    expect(formatDate('2026-09-09T15:30:00Z')).toBe('2026/09/10');
    expect(exclusiveEndDate('2026-03-09')).toBe('2026-03-08');
    expect(() => formatDate('bad')).toThrow();
    expect(positiveIntegerParam({ page: '-1' }, 'page')).toBe(1);
    expect(positiveIntegerParam({ page: '3' }, 'page')).toBe(3);
    expect(stringParam({ q: ['first', 'second'] }, 'q')).toBe('first');
    expect(stringsParam({ q: ['one', 'two'] }, 'q')).toEqual(['one', 'two']);
    expect(dateParam({ date: '2026-02-30' }, 'date')).toBeUndefined();
    const client = createQueryClient();
    expect(client.getDefaultOptions().queries?.staleTime).toBeGreaterThan(0);
    client.clear();
  });
});
