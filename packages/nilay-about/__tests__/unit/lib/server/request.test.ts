import { describe, it, expect } from 'vitest';

import { getClientIp } from '@/lib/server/request';

describe('getClientIp', () => {
  it.each([
    ['x-vercel-forwarded-for', '192.0.2.1'],
    ['cf-connecting-ip', '192.0.2.2'],
    ['x-real-ip', '192.0.2.3'],
    ['x-forwarded-for', '192.0.2.4'],
  ])('uses %s before lower priority headers', (header, address) => {
    const headers = new Headers({
      'x-vercel-forwarded-for': '192.0.2.1, 10.0.0.1',
      'cf-connecting-ip': '192.0.2.2',
      'x-real-ip': '192.0.2.3',
      'x-forwarded-for': '192.0.2.4, 10.0.0.1',
    });
    for (const name of ['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip', 'x-forwarded-for']) {
      if (name === header) break;
      headers.delete(name);
    }
    expect(getClientIp(new Request('https://example.test', { headers }))).toBe(address);
  });

  it('skips blank header values and trims addresses', () => {
    const request = new Request('https://example.test', {
      headers: { 'x-vercel-forwarded-for': ' , 10.0.0.1', 'cf-connecting-ip': ' 2001:db8::1 ' },
    });
    expect(getClientIp(request)).toBe('2001:db8::1');
  });

  it('uses the shared local address when no proxy address is present', () => {
    expect(getClientIp(new Request('https://example.test'))).toBe('127.0.0.1');
  });
});
