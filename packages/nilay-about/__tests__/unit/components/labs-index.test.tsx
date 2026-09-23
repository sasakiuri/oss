import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { LabsIndex } from '@/app/(site)/labs/labs-index';
import { useLanguageStore } from '@/store';

describe('the list of tools', () => {
  beforeEach(() => useLanguageStore.setState({ language: 'ja' }));

  it('names every tool as a term that links to it', () => {
    render(<LabsIndex />);
    // One description list is how a screen reader announces what is on offer and how much of it.
    const terms = screen.getAllByRole('term');
    expect(terms).toHaveLength(29);
    for (const term of terms) expect(within(term).getByRole('link').getAttribute('href')).toMatch(/^\/labs\//);
  });

  it('groups the tools under a heading for each kind of work', () => {
    render(<LabsIndex />);
    const study = screen.getByRole('region', { name: '試験・法令の学習' });
    expect(within(study).getByRole('link', { name: '狩猟鳥獣の判別練習' })).toHaveAttribute(
      'href',
      '/labs/game-species-test',
    );
    const sighting = screen.getByRole('region', { name: '照準と弾道' });
    expect(within(sighting).getByRole('link', { name: '弾道の合わせ込み（トゥルーイング）' })).toHaveAttribute(
      'href',
      '/labs/trajectory-truing',
    );
  });

  it('reads in Japanese when that is what the site is set to', () => {
    render(<LabsIndex />);
    expect(screen.getByRole('heading', { level: 1, name: '狩猟・射撃のツール (Labs)' })).toBeInTheDocument();
    expect(screen.getByText(/登録不要で、入力した内容はこのブラウザーの中だけに保存します。/)).toBeInTheDocument();
  });

  it('reads in English when that is what the site is set to', () => {
    useLanguageStore.setState({ language: 'en' });
    render(<LabsIndex />);
    expect(screen.getByRole('heading', { level: 1, name: 'Hunting and shooting tools (Labs)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trajectory Truing' })).toHaveAttribute('href', '/labs/trajectory-truing');
    expect(screen.getByText(/No sign-up; what you enter stays in this browser\./)).toBeInTheDocument();
  });

  it('says which tools it cannot offer in English', () => {
    useLanguageStore.setState({ language: 'en' });
    render(<LabsIndex />);
    // Three of them are written against Japanese statutes and forms and are not translated.
    expect(screen.getAllByText(/Japanese only/)).toHaveLength(3);
  });
});
