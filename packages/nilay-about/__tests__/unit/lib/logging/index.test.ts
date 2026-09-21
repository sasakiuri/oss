import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, createRequestLogger, getRequestContext, logger } from '@/lib/logging';
import { getClientIp } from '@/lib/server/request';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('structured server logging', () => {
  it('sanitizes nested context and errors in production logs', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    const context: Record<string, unknown> = { email: 'user@example.com', records: [{ api_key: 'secret-value' }] };
    context.self = context;

    logger.error('Contact delivery failed', new Error('Unable to deliver to user@example.com'), context);

    const serialized = output.mock.calls[0]?.[0] as string;
    const entry = JSON.parse(serialized);
    expect(entry.message).toBe('Contact delivery failed');
    expect(entry.error).toEqual({ name: 'Error', fingerprint: expect.stringMatching(/^\[HMAC:/) });
    expect(entry.context).toMatchObject({
      email: expect.stringMatching(/^\[HMAC:/),
      records: [{ api_key: '[REDACTED]' }],
      self: '[Circular]',
    });
    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('secret-value');
  });

  it.each(['development', 'production'])(
    'does not expose multiline error text resembling a stack frame in %s',
    (environment) => {
      vi.stubEnv('NODE_ENV', environment);
      const output = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('request failed\n    at private-demo-value');
      logger.error('Contact delivery failed', error);

      const serialized = output.mock.calls[0]?.[0] as string;
      expect(JSON.parse(serialized).error).toEqual({ name: 'Error', fingerprint: expect.stringMatching(/^\[HMAC:/) });
      expect(serialized).not.toContain('private-demo-value');
    },
  );

  it('shares address extraction and excludes arbitrary query values', () => {
    const request = new Request('https://example.test/api/contact?search=private-value&email=user@example.com', {
      headers: { 'x-vercel-forwarded-for': ' , 10.0.0.1', 'x-real-ip': '192.0.2.1', 'x-request-id': 'request-id' },
    });
    const context = getRequestContext(request);
    expect(context.ip).toBe(getClientIp(request));
    expect(context).toMatchObject({ path: '/api/contact', queryKeys: ['search', 'email'], requestId: 'request-id' });
    expect(JSON.stringify(context)).not.toContain('private-value');
    expect(JSON.stringify(context)).not.toContain('user@example.com');
  });

  it('adds request context and sanitizes the address when writing a request log', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createRequestLogger(
      new Request('https://example.test/api/news', { headers: { 'x-real-ip': '192.0.2.1' } }),
    );
    log.info('News fetched', { count: 1 });
    expect(JSON.parse(output.mock.calls[0]?.[0] as string).context).toMatchObject({
      path: '/api/news',
      ip: expect.stringMatching(/^\[HMAC:/),
      count: 1,
    });
  });

  it('merges child context and only emits debug logs in development', () => {
    const output = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const log = createLogger({ feature: 'news', page: 1 });
    vi.stubEnv('NODE_ENV', 'production');
    log.debug('Page loaded');
    expect(output).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', 'development');
    log.debug('Page loaded', { page: 2 });
    expect(JSON.parse(output.mock.calls[0]?.[0] as string).context).toEqual({ feature: 'news', page: 2 });
  });
});
