import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ContentReview } from '@/components/content-review';

describe('content review record', () => {
  it('shows an unrecorded check without inventing a date or review claim', () => {
    const { container } = render(<ContentReview review={undefined} />);
    expect(screen.getByText('情報の最終確認日：未記録')).toBeInTheDocument();
    expect(container.querySelector('time')).toBeNull();
  });

  it('renders the exact checked scope, region, Japan date and original source', () => {
    const { container } = render(
      <ContentReview
        review={{
          checked: '2026-09-21T16:00:00Z',
          region: '東京都',
          scope: '掲載した手数料の金額',
          sources: [{ title: '公式の手数料一覧', url: 'https://example.go.jp/fees' }],
        }}
      />,
    );
    expect(screen.getByRole('complementary', { name: '情報の確認記録' })).toBeInTheDocument();
    expect(screen.getByText('東京都')).toBeInTheDocument();
    expect(screen.getByText('掲載した手数料の金額')).toBeInTheDocument();
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2026-09-21T16:00:00Z');
    expect(container.querySelector('time')).toHaveTextContent('2026年9月22日');
    expect(screen.getByRole('link', { name: '公式の手数料一覧' })).toHaveAttribute(
      'href',
      'https://example.go.jp/fees',
    );
  });
});
