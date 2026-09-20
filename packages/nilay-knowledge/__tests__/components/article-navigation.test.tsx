import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ArticleNavigation } from '@/components/article-navigation';

it('offers the next article and index on the first article without a previous link', () => {
  render(<ArticleNavigation slug="1378038316" />);
  const navigation = within(screen.getByRole('navigation', { name: '記事の移動' }));
  expect(navigation.queryByRole('link', { name: /前の記事/ })).not.toBeInTheDocument();
  expect(navigation.getByRole('link', { name: /次の記事/ })).toHaveAttribute('href', '/articles/1403944258');
  expect(navigation.getByRole('link', { name: '記事一覧へ戻る' })).toHaveAttribute('href', '/articles');
});

it('offers a previous article on the last article, and only the index for an unlisted article', () => {
  const { rerender } = render(<ArticleNavigation slug="1418054543" />);
  expect(screen.getByRole('link', { name: /前の記事/ })).toHaveAttribute('href', '/articles/1414030655');
  expect(screen.queryByRole('link', { name: /次の記事/ })).not.toBeInTheDocument();
  rerender(<ArticleNavigation slug="unlisted" />);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByRole('link', { name: '記事一覧へ戻る' })).toBeInTheDocument();
});
