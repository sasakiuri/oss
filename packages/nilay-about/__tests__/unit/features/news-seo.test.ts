import { beforeEach, describe, expect, it, vi } from 'vitest';

const find = vi.fn();
const list = vi.fn();
vi.mock('@/features/news/server/repository', () => ({ newsRepository: { find, list } }));
const logError = vi.fn();
vi.mock('@/lib/logging', () => ({ logger: { error: logError } }));

const { generateMetadata } = await import('@/app/(site)/news/[id]/page');
const { default: newsSitemap } = await import('@/app/(site)/news/sitemap');

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('news article metadata', () => {
  beforeEach(() => {
    find.mockReset();
    list.mockReset();
    logError.mockReset();
  });

  it('titles and describes the page from the article', async () => {
    find.mockResolvedValue({
      id: 'a1',
      title: '新商品の入荷',
      date: new Date('2026-09-01T00:00:00Z'),
      summary: '<p>くくりわなを\n入荷しました。</p>',
    });
    const metadata = await generateMetadata(params('a1'));
    expect(metadata.title).toBe('新商品の入荷');
    expect(metadata.description).toBe('くくりわなを 入荷しました。');
    expect(metadata.alternates?.canonical).toBe('/news/a1');
    expect(metadata.openGraph).toMatchObject({ type: 'article', publishedTime: '2026-09-01T00:00:00.000Z' });
  });

  it('keeps a missing article out of the index', async () => {
    find.mockResolvedValue(null);
    const metadata = await generateMetadata(params('gone'));
    expect(metadata.robots).toEqual({ index: false });
  });

  it('logs a failed lookup and keeps the page out of the index', async () => {
    find.mockRejectedValue(new Error('microCMS request failed (503)'));
    const metadata = await generateMetadata(params('down'));
    expect(metadata.robots).toEqual({ index: false });
    expect(metadata.alternates).toBeUndefined();
    expect(logError).toHaveBeenCalledWith('Failed to load news metadata', expect.any(Error), expect.anything());
  });
});

describe('news sitemap', () => {
  beforeEach(() => {
    list.mockReset();
  });

  const page = (count: number, start: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `n${start + index}`,
      title: '',
      summary: '',
      date: new Date(),
    }));

  it('reads every page of articles', async () => {
    list.mockResolvedValueOnce(page(100, 0)).mockResolvedValueOnce(page(3, 100));
    const entries = await newsSitemap();
    expect(entries).toHaveLength(103);
    expect(entries[102]?.url).toBe('https://about.nilay.jp/news/n102');
    expect(list).toHaveBeenLastCalledWith({ limit: 100, offset: 100 });
  });

  it('fails rather than publishing an empty sitemap when microCMS cannot be reached', async () => {
    list.mockRejectedValue(new Error('microCMS configuration is missing or invalid'));
    await expect(newsSitemap()).rejects.toThrow('configuration');
  });
});
