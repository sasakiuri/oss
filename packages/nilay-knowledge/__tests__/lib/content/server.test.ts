// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderContent } from '@/lib/content/render';
import { getContentDocument, getContentSource, listContent } from '@/lib/content/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/content/render', () => ({ renderContent: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('server content adapter', () => {
  it.each(['missing.entry', '../news/entry', '%2e%2e', '未登録'])(
    'treats invalid public slug %j as missing for metadata and detail',
    async (slug) => {
      expect(await getContentSource('articles', slug)).toBeNull();
      expect(await getContentDocument('articles', slug)).toBeNull();
      expect(await getContentSource('news', slug)).toBeNull();
      expect(await getContentDocument('news', slug)).toBeNull();
      expect(renderContent).not.toHaveBeenCalled();
    },
  );

  it('serves real news summaries and metadata without invoking the renderer', async () => {
    const summaries = await listContent('news');
    expect(summaries.length).toBeGreaterThan(0);
    const summary = summaries[0]!;
    const metadata = await getContentSource('news', summary.slug);
    expect(metadata?.frontmatter).toEqual(summary.frontmatter);
    expect(summaries.every((item) => !('content' in item) && !('html' in item))).toBe(true);
    expect(renderContent).not.toHaveBeenCalled();
  });

  it('renders only the requested detail and preserves missing-entry semantics', async () => {
    const summary = (await listContent('articles'))[0]!;
    vi.mocked(renderContent).mockResolvedValue({ html: '<p>Rendered</p>', tableOfContents: [] });
    const detail = await getContentDocument('articles', summary.slug);
    expect(detail).toMatchObject({ slug: summary.slug, html: '<p>Rendered</p>', tableOfContents: [] });
    expect(renderContent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ slug: summary.slug }));
    expect(await getContentDocument('articles', 'missing-entry')).toBeNull();
    expect(renderContent).toHaveBeenCalledTimes(1);
  });
});
