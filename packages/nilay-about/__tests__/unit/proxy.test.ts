import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('production Content Security Policy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows news images hosted by microCMS', async () => {
    const { proxy } = await import('@/proxy');
    const response = proxy(new NextRequest('https://about.nilay.jp/news/example'));
    const csp = response.headers.get('Content-Security-Policy');
    const imageSources = csp?.split('; ').find((directive) => directive.startsWith('img-src '));
    expect(imageSources?.split(' ')).toContain('https://images.microcms-assets.io');
  });

  it('allows the GSI map tiles the field tools show, and no other map host', async () => {
    const { proxy } = await import('@/proxy');
    const response = proxy(new NextRequest('https://about.nilay.jp/labs/hunter-map'));
    const imageSources = response.headers
      .get('Content-Security-Policy')
      ?.split('; ')
      .find((directive) => directive.startsWith('img-src '));
    expect(imageSources?.split(' ')).toContain('https://cyberjapandata.gsi.go.jp');
    expect(imageSources).not.toContain('*');
  });

  it('lets the photo measure tool fetch its model from Hugging Face', async () => {
    const { proxy } = await import('@/proxy');
    const response = proxy(new NextRequest('https://about.nilay.jp/labs/photo-measure'));
    const connectSources = response.headers
      .get('Content-Security-Policy')
      ?.split('; ')
      .find((directive) => directive.startsWith('connect-src '))
      ?.split(' ');
    expect(connectSources).toEqual(expect.arrayContaining(['https://huggingface.co', 'https://*.hf.co']));
  });

  it('allows WebAssembly for the on-device model without allowing JavaScript eval', async () => {
    const { proxy } = await import('@/proxy');
    const response = proxy(new NextRequest('https://about.nilay.jp/labs/photo-measure'));
    const csp = response.headers.get('Content-Security-Policy');
    const scriptSources = csp
      ?.split('; ')
      .find((directive) => directive.startsWith('script-src '))
      ?.split(' ');
    expect(scriptSources).toContain("'wasm-unsafe-eval'");
    expect(scriptSources).not.toContain("'unsafe-eval'");
  });

  it.each(['http://localhost:3001', 'http://127.0.0.1:3001', 'http://[::1]:3001'])(
    'allows local HTTP assets without weakening other directives at %s',
    async (origin) => {
      const { proxy } = await import('@/proxy');
      const response = proxy(new NextRequest(`${origin}/contact`, { headers: { host: new URL(origin).host } }));
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).not.toContain('upgrade-insecure-requests');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
    },
  );

  it.each([
    'https://about.nilay.jp',
    'http://about.nilay.jp',
    'http://localhost.example.com',
    'http://127.0.0.1.example.com',
    'https://localhost:3001',
  ])('keeps HTTPS upgrades enabled at %s', async (origin) => {
    const { proxy } = await import('@/proxy');
    const response = proxy(new NextRequest(`${origin}/contact`, { headers: { host: new URL(origin).host } }));
    expect(response.headers.get('Content-Security-Policy')).toContain('upgrade-insecure-requests');
  });

  it.each<Record<string, string>>([
    {},
    { host: 'about.nilay.jp' },
    { host: '127.0.0.1:3001', 'x-forwarded-host': 'about.nilay.jp' },
    { host: '127.0.0.1:3001', 'x-forwarded-host': 'localhost:3001, about.nilay.jp' },
    { host: '127.0.0.1:3001', 'x-forwarded-proto': 'https' },
    { host: '127.0.0.1:3001', 'x-forwarded-proto': 'http, https' },
    { host: '127.0.0.1:3001', forwarded: 'host=about.nilay.jp;proto=https' },
  ] satisfies Record<string, string>[])(
    'keeps HTTPS upgrades for ambiguous or public proxy origins: %j',
    async (headers) => {
      const { proxy } = await import('@/proxy');
      const response = proxy(new NextRequest('http://127.0.0.1:3001/contact', { headers }));
      expect(response.headers.get('Content-Security-Policy')).toContain('upgrade-insecure-requests');
    },
  );
});
