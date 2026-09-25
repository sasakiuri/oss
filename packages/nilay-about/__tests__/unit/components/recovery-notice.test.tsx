import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecoveryNotice } from '@/components/labs/recovery-notice';
import { useRecovery } from '@/lib/labs-session';
import { useLanguageStore } from '@/store';

const path = vi.hoisted(() => ({ current: '/labs/recoil' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));

describe('RecoveryNotice', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'ja' });
    useRecovery.setState({ result: 'none' });
    path.current = '/labs/recoil';
  });

  it('says a tool is not saving while a restore cut short waits, and links to where it is settled', () => {
    render(<RecoveryNotice />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => useRecovery.setState({ result: 'failed' }));
    expect(screen.getByRole('status')).toHaveTextContent('保存を止めています');
    expect(screen.getByRole('link', { name: 'データの書き出し・読み込みで解決する' })).toHaveAttribute(
      'href',
      '/labs/data',
    );
  });

  it('leaves the data page to say it in its own words', () => {
    path.current = '/labs/data';
    useRecovery.setState({ result: 'failed' });
    render(<RecoveryNotice />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
