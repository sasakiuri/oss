import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { Breadcrumb } from '@/components/breadcrumb';

describe('Breadcrumb', () => {
  // Next.js injects this flag from trailingSlash: true in production builds.
  beforeEach(() => vi.stubEnv('__NEXT_TRAILING_SLASH', 'true'));
  afterEach(() => vi.unstubAllEnvs());

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
    expect(articlesLink).toHaveAttribute('href', '/articles/');
  });

  it('identifies the current page without making it a link', () => {
    render(<Breadcrumb items={mockItems} />);

    const finalItem = screen.getByText('テスト記事');
    expect(finalItem).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'テスト記事' })).not.toBeInTheDocument();
  });

  it('hides navigation when showNav is false', () => {
    const { container } = render(<Breadcrumb items={mockItems} showNav={false} />);

    // Should not find the nav element
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(container.querySelector('script[type="application/ld+json"]')).toBeInTheDocument();
  });

  it('omits navigation and structured data when there are no items', () => {
    const { container } = render(<Breadcrumb items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('includes JSON-LD structured data', () => {
    const { container } = render(<Breadcrumb items={mockItems} />);

    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();

    const jsonLd = JSON.parse(script?.textContent || '{}');
    expect(jsonLd['@type']).toBe('BreadcrumbList');
    expect(jsonLd.itemListElement).toHaveLength(3);
    expect(jsonLd.itemListElement[2].item).toBe('https://knowledge.nilay.jp/articles/test/');
  });

  it('does not emit an invalid single-item breadcrumb', () => {
    const { container } = render(<Breadcrumb items={[mockItems[0]!]} showNav={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('escapes a closing script tag in editorial text while preserving JSON data', () => {
    const name = '</script><script>alert(1)</script>';
    const { container } = render(<Breadcrumb items={[mockItems[0]!, { name, slug: 'articles/example' }]} />);
    const script = container.querySelector('script')!;
    expect(script.textContent).not.toContain('</script>');
    expect(JSON.parse(script.textContent!).itemListElement[1].name).toBe(name);
  });
});
