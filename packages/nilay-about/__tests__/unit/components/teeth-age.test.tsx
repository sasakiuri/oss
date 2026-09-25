import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TeethAgeClient } from '@/app/(standalone)/labs/teeth-age/teeth-age-client';
import { useLanguageStore } from '@/store';

vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title, actions }: { title: string; actions?: ReactNode }) =>
      createElement('header', null, title, actions),
    LanguageMenu: () => null,
  };
});

const choose = (group: string | RegExp, option: string | RegExp) =>
  fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('radio', { name: option }));
const result = () => screen.getByRole('region', { name: '年齢の目安' });

beforeEach(() => useLanguageStore.setState({ language: 'ja' }));

describe('the questions', () => {
  it('asks a deer about the first incisor and its wear', async () => {
    const { container } = render(<TeethAgeClient />);
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    expect(result()).toHaveTextContent('質問に答えると表示します。');
    choose(/第一切歯/, '永久歯');
    choose(/第一切歯の摩滅/, /^III：/);
    expect(result()).toHaveTextContent('3〜5 歳');
    expect(result()).toHaveTextContent('オス 3.6 ± 0.3 歳、メス 4.3 ± 0.4 歳');
  });

  it('asks a boar about the molars from the back, and stops asking once one is enough', async () => {
    const { container } = render(<TeethAgeClient />);
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    choose('動物', 'イノシシ');
    choose(/第三後臼歯/, 'まだ無い');
    choose('第二後臼歯', '生えかけ');
    expect(screen.queryByRole('group', { name: '第一後臼歯' })).toBeNull();
    expect(result()).toHaveTextContent('1 歳を迎えるころ（春〜初夏）');
    choose(/第三後臼歯/, '最後の第 7 咬頭まで出ている');
    expect(screen.queryByRole('group', { name: '第二後臼歯' })).toBeNull();
    expect(result()).toHaveTextContent('3 歳（秋〜冬）以上');
  });
});
