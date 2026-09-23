import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionNav } from '@/components/labs';

const sections = [
  { id: 'load-and-rifle', label: '弾と銃' },
  { id: 'summary', label: '結果の要点' },
  { id: 'notes', label: '注記' },
];

describe('the jump links on a long tool', () => {
  it('names itself in the language of the page, so it is not read as an unlabelled list', () => {
    const { rerender } = render(<SectionNav language="ja" sections={sections} />);
    expect(screen.getByRole('navigation', { name: 'このページの中を移動' })).toBeInTheDocument();
    rerender(<SectionNav language="en" sections={sections} />);
    expect(screen.getByRole('navigation', { name: 'Jump to a section of this page' })).toBeInTheDocument();
  });

  it('points each link at the section of the same name, in the order given', () => {
    render(<SectionNav language="ja" sections={sections} />);
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['弾と銃', '結果の要点', '注記']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['#load-and-rifle', '#summary', '#notes']);
  });

  it('shows only the sections it was given, so a link never points at a section that is not there', () => {
    // The tools whose later sections wait on a result leave them out of this list until there is one.
    render(<SectionNav language="ja" sections={sections.slice(0, 2)} />);
    expect(within(screen.getByRole('navigation')).getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: '注記' })).not.toBeInTheDocument();
  });

  it('is left out of a print, where a link to elsewhere on the page means nothing', () => {
    render(<SectionNav language="ja" sections={sections} />);
    expect(screen.getByRole('navigation').className).toContain('print:hidden');
  });
});
