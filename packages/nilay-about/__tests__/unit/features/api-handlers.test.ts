import { describe, expect, it, vi } from 'vitest';

import { createContactHandler } from '@/features/contact/server/handler';
import { createNewsHandlers } from '@/features/news/server/handlers';
import type { NewsRepository } from '@/features/news/server/repository';
import type { RouteDependencies } from '@/lib/server/http';
import { RequestError } from '@/lib/server/http';

function dependencies(): RouteDependencies {
  return {
    checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetIn: 60_000 }),
    createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  };
}

const news = { id: 'one', title: 'News', summary: '<p>Content</p>', date: new Date('2026-01-01T00:00:00Z') };
function repository(): NewsRepository {
  return { list: vi.fn().mockResolvedValue([news]), find: vi.fn().mockResolvedValue(news) };
}
const validContact = { title: 'Question', message: 'Message', requiresReply: false };
const requestContact = (body: unknown) =>
  new Request('https://example.test/api/contact', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('news HTTP boundary', () => {
  it('passes validated default pagination and serializes dates', async () => {
    const repo = repository();
    const response = await createNewsHandlers(repo, dependencies()).list(
      new Request('https://example.test/api/news'),
      undefined,
    );
    expect(repo.list).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(await response.json()).toEqual({ newsList: [{ ...news, date: news.date.toISOString() }] });
  });

  it.each(['limit=0', 'limit=101', 'offset=-1', 'offset=NaN', 'limit=1.5', 'offset=9007199254740992'])(
    'rejects invalid pagination: %s',
    async (query) => {
      const repo = repository();
      const response = await createNewsHandlers(repo, dependencies()).list(
        new Request(`https://example.test/api/news?${query}`),
        undefined,
      );
      expect(response.status).toBe(400);
      expect(repo.list).not.toHaveBeenCalled();
    },
  );

  it('passes explicit pagination', async () => {
    const repo = repository();
    await createNewsHandlers(repo, dependencies()).list(
      new Request('https://example.test/api/news?limit=10&offset=20'),
      undefined,
    );
    expect(repo.list).toHaveBeenCalledWith({ limit: 10, offset: 20 });
  });

  it('returns a detail and distinguishes missing news', async () => {
    const repo = repository();
    const handlers = createNewsHandlers(repo, dependencies());
    const request = new Request('https://example.test/api/news/one');
    const response = await handlers.detail(request, { params: Promise.resolve({ id: 'one' }) });
    expect(await response.json()).toMatchObject({ news: { id: 'one' } });
    vi.mocked(repo.find).mockResolvedValueOnce(null);
    expect((await handlers.detail(request, { params: Promise.resolve({ id: 'gone' }) })).status).toBe(404);
  });

  it('hides upstream errors from the response', async () => {
    const repo = repository();
    vi.mocked(repo.list).mockRejectedValue(new Error('X-MICROCMS-API-KEY: private-test-key'));
    const response = await createNewsHandlers(repo, dependencies()).list(
      new Request('https://example.test/api/news'),
      undefined,
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to fetch news' });
  });
});

describe('contact HTTP boundary', () => {
  it('validates and delivers a message once with the returned tracking id', async () => {
    const deliver = vi.fn();
    const handler = createContactHandler(deliver, dependencies(), () => 'tracking-id');
    const response = await handler(requestContact(validContact), undefined);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasError: false, errorMessage: '', uuid: 'tracking-id' });
    expect(deliver).toHaveBeenCalledExactlyOnceWith(validContact, 'tracking-id');
  });

  it.each([
    { ...validContact, title: '   ' },
    { ...validContact, title: 'x'.repeat(201) },
    { ...validContact, message: 'x'.repeat(2001) },
    { ...validContact, requiresReply: true },
    { ...validContact, requiresReply: true, email: 'invalid' },
  ])('rejects invalid input without delivering', async (body) => {
    const deliver = vi.fn();
    const response = await createContactHandler(deliver, dependencies())(requestContact(body), undefined);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ hasError: true, uuid: '' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const deliver = vi.fn();
    const response = await createContactHandler(deliver, dependencies())(
      new Request('https://example.test/api/contact', {
        method: 'POST',
        body: '{',
      }),
      undefined,
    );
    expect(response.status).toBe(400);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('returns retry headers and never delivers a rate-limited request', async () => {
    const deps = dependencies();
    vi.mocked(deps.checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetIn: 1200 });
    const deliver = vi.fn();
    const response = await createContactHandler(deliver, deps)(requestContact(validContact), undefined);
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('2');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(await response.json()).toMatchObject({ hasError: true, uuid: '' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it.each([502, 504])('preserves safe delivery failure status %i', async (status) => {
    const deliver = vi.fn().mockRejectedValue(new RequestError(status, 'Delivery unavailable'));
    const response = await createContactHandler(deliver, dependencies())(requestContact(validContact), undefined);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ hasError: true, errorMessage: 'Delivery unavailable', uuid: '' });
    expect(deliver).toHaveBeenCalledTimes(1);
  });
});
