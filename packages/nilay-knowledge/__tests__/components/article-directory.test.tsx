// cspell:words nuqs
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { describe, expect, it, vi } from 'vitest';

import { ArticleDirectory, ArticleDirectoryResults } from '@/components/article-directory';
import { createArticleDirectory } from '@/lib/content/taxonomy';

const articles = createArticleDirectory([
  {
    type: 'articles',
    slug: '1378038316',
    frontmatter: { title: '取得', published: '2024-01-01', tags: ['許可', '入門'], category: 'getting-started' },
  },
  {
    type: 'articles',
    slug: '1403944258',
    frontmatter: { title: '狩猟', published: '2024-01-01', tags: ['狩猟', '入門'], category: 'getting-started' },
  },
  {
    type: 'articles',
    slug: '1403250921',
    frontmatter: { title: '更新', published: '2024-01-01', tags: ['許可'], category: 'procedures' },
  },
]);
const entries = Object.fromEntries(
  articles.map((article) => [
    article.slug,
    <a key={article.slug} href={`/articles/${article.slug}/`}>
      {article.frontmatter.title}
    </a>,
  ]),
);

function setup(searchParams = '') {
  const onUrlUpdate = vi.fn();
  render(<ArticleDirectory articles={articles} entries={entries} />, {
    wrapper: withNuqsTestingAdapter({ searchParams, hasMemory: true, onUrlUpdate }),
  });
  return onUrlUpdate;
}

describe('article directory filters', () => {
  it('restores combined filters from a shared URL', () => {
    setup('?category=getting-started&tag=許可&tag=入門');
    expect(screen.getByRole('status')).toHaveTextContent('3件中 1件の記事');
    expect(screen.getByRole('link', { name: '取得' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '更新' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#許可 1件' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '#狩猟 0件' })).toBeDisabled();
  });

  it('updates category and tag counts and clears filters while preserving unrelated URL parameters', async () => {
    const onUrlUpdate = setup('?source=shared');
    fireEvent.click(screen.getByRole('button', { name: '#許可 2件' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3件中 2件の記事'));
    fireEvent.change(screen.getByRole('combobox', { name: 'カテゴリー' }), { target: { value: 'getting-started' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3件中 1件の記事'));
    expect(screen.getByRole('option', { name: '制度と法令（1件）' })).toBeInTheDocument();
    await waitFor(() => expect(onUrlUpdate.mock.lastCall?.[0].searchParams.getAll('tag')).toEqual(['許可']));
    fireEvent.click(screen.getByRole('button', { name: '絞り込みを解除' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3件中 3件の記事'));
    await waitFor(() => expect(onUrlUpdate.mock.lastCall?.[0].queryString).toBe('?source=shared'));
  });

  it('lets users remove unknown URL tags from an empty result', async () => {
    setup('?category=unknown&tag=unknown');
    expect(screen.getByRole('status')).toHaveTextContent('3件中 0件の記事');
    expect(screen.getByText(/条件に一致する記事がありません/)).toBeInTheDocument();
    const selected = screen.getByRole('button', { name: '#unknown 0件' });
    expect(selected).toBeEnabled();
    fireEvent.click(selected);
    await waitFor(() => expect(screen.queryByRole('button', { name: '#unknown 0件' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '絞り込みを解除' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('3件中 3件の記事'));
  });

  it('renders every article and the existing section anchors in the static fallback', () => {
    render(<ArticleDirectoryResults articles={articles} entries={entries} />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: 'イントロダクション 2件' })).toHaveAttribute('id', 'getting-started');
  });
});
