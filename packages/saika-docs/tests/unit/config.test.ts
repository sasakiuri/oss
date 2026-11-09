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

describe('security header contract', () => {
  const headers = (client: Record<string, string> = {}, server: Record<string, string> = {}, development = false) =>
    Object.fromEntries(
      securityHeaders(publicEnvSchema.parse(client), serverEnvSchema.parse(server), development).map(
        ({ key, value }) => [key, value],
      ),
    );

  it('publishes the complete default browser policy without integration origins', () => {
    expect(headers()).toEqual({
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-DNS-Prefetch-Control': 'on',
    });
    expect(headers({ NEXT_PUBLIC_SITE_URL: 'https://example.test' })['Strict-Transport-Security']).toBe(
      'max-age=31536000',
    );
  });

  it('permits development connections only in development', () => {
    const csp = headers({}, {}, true)['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval';");
    expect(csp).toContain("connect-src 'self' ws: wss:;");
  });

  it('scopes telemetry, image hosts and report delivery to configured endpoints', () => {
    const result = headers(
      {
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@errors.example.test/1',
        NEXT_PUBLIC_GTM_ID: 'GTM-ABCDE',
        NEXT_PUBLIC_CLARITY_ID: 'abc123',
      },
      {
        DOCS_IMAGE_HOSTS: 'images.example.test,cdn.example.test',
        SENTRY_CSP_REPORT_URI: 'https://errors.example.test/csp',
      },
    );
    expect(result['Content-Security-Policy']).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://www.googletagmanager.com https://www.clarity.ms https://scripts.clarity.ms;",
    );
    expect(result['Content-Security-Policy']).toContain(
      "connect-src 'self' https://errors.example.test https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.clarity.ms;",
    );
    expect(result['Content-Security-Policy']).toContain(
      "img-src 'self' data: blob: https://images.example.test https://cdn.example.test https://www.googletagmanager.com https://*.google-analytics.com https://*.clarity.ms https://c.bing.com;",
    );
    expect(result['Content-Security-Policy']).toMatch(
      /; report-uri https:\/\/errors\.example\.test\/csp; report-to csp-endpoint$/,
    );
    expect(JSON.parse(result['Report-To']!)).toEqual({
      group: 'csp-endpoint',
      max_age: 10886400,
      endpoints: [{ url: 'https://errors.example.test/csp' }],
    });
  });
});
