import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from '@/components/breadcrumb';

describe('Breadcrumb', () => {
  const mockItems = [
    { name: 'トップ', slug: '' },
    { name: '記事一覧', slug: 'articles' },
    { name: 'テスト記事', slug: 'articles/test' },
  ];

  it('renders all breadcrumb items', () => {
    render(<Breadcrumb items={mockItems} />);

    expect(screen.getByText('トップ')).toBeInTheDocument();
    expect(screen.getByText('記事一覧')).toBeInTheDocument();
    expect(screen.getByText('テスト記事')).toBeInTheDocument();
  });

  it('renders links for non-final items', () => {
    render(<Breadcrumb items={mockItems} />);

    const homeLink = screen.getByRole('link', { name: 'トップ' });
    const articlesLink = screen.getByRole('link', { name: '記事一覧' });

    expect(homeLink).toHaveAttribute('href', '/');
    expect(articlesLink).toHaveAttribute('href', '/articles');
  });

  it('does not render link for final item', () => {
    render(<Breadcrumb items={mockItems} />);

    // Final item should be a span, not a link
    const finalItem = screen.getByText('テスト記事');
    expect(finalItem.tagName).toBe('SPAN');
  });

  it('hides navigation when showNav is false', () => {
    render(<Breadcrumb items={mockItems} showNav={false} />);

    // Should not find the nav element
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('includes JSON-LD structured data', () => {
    const { container } = render(<Breadcrumb items={mockItems} />);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();

    const jsonLd = JSON.parse(script?.textContent || '{}');
    expect(jsonLd['@type']).toBe('BreadcrumbList');
    expect(jsonLd.itemListElement).toHaveLength(3);
  });
});
