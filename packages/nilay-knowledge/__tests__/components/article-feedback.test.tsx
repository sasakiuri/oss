import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ArticleFeedback } from '@/components/article-feedback';

describe('article contribution links', () => {
  it.each(['articles', 'news'] as const)('targets the matching %s source and prefills an issue', (type) => {
    render(<ArticleFeedback type={type} slug="1378038316" title="記事 & 資料 #1" />);
    const issue = new URL(screen.getByRole('link', { name: /^修正を依頼/ }).getAttribute('href')!);
    expect(issue.origin + issue.pathname).toBe('https://github.com/sasakiuri/oss/issues/new');
    expect(issue.searchParams.get('template')).toBe('1_generic_report.md');
    expect(issue.searchParams.get('title')).toBe('[記事の修正] 記事 & 資料 #1');
    expect(issue.searchParams.get('body')).toContain(`https://knowledge.nilay.jp/${type}/1378038316/`);
    expect(issue.searchParams.get('body')).toContain(
      `https://github.com/sasakiuri/oss/blob/1.x/packages/nilay-knowledge/content/${type}/1378038316/index.md`,
    );
    expect(screen.getByRole('link', { name: /^編集して提案/ })).toHaveAttribute(
      'href',
      `https://github.com/sasakiuri/oss/edit/1.x/packages/nilay-knowledge/content/${type}/1378038316/index.md`,
    );
  });
});
