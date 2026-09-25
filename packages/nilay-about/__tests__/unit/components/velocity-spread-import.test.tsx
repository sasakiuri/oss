import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVelocitySpreadStore } from '@/app/(standalone)/labs/velocity-spread/_store';
import { VelocitySpreadClient } from '@/app/(standalone)/labs/velocity-spread/velocity-spread-client';
import { useStorageStatus } from '@/lib/browser-storage';

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

const labRadar = [
  'sep=;',
  'Series No;0004;;',
  'Units velocity;fps;;',
  'Shot ID;V0;V1;Date;Time',
  '0001;2743;2741;06-24-2019;19:49:28;',
  '0002;2701;2699;06-24-2019;19:50:02;',
].join('\r\n');

/** jsdom's File has no text(), which every browser the site supports does. */
const csvFile = (content: string, name: string) =>
  Object.assign(new File([content], name, { type: 'text/csv' }), { text: async () => content });

describe('velocity spread: loading a chronograph file', () => {
  beforeEach(() => {
    useVelocitySpreadStore.setState(useVelocitySpreadStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });

  it('replaces the readings with the file’s, in the unit the file was recorded in', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<VelocitySpreadClient />);
    fireEvent.change(await screen.findByLabelText('弾速計の CSV を読み込む'), {
      target: { files: [csvFile(labRadar, 'SR0004 Report.csv')] },
    });
    expect(
      await screen.findByText('LabRadar のファイル「SR0004」から 2 発（fps）を読み込みました。'),
    ).toBeInTheDocument();
    expect(useVelocitySpreadStore.getState()).toMatchObject({ readings: '2743\n2701', speedUnit: 'fps' });
  });

  it('says so when the file is not one it can read', async () => {
    render(<VelocitySpreadClient />);
    fireEvent.change(await screen.findByLabelText('弾速計の CSV を読み込む'), {
      target: { files: [csvFile('hello', 'notes.csv')] },
    });
    expect(await screen.findByText(/このファイルの形式は読み取れません/)).toBeInTheDocument();
    expect(useVelocitySpreadStore.getState().readings).toContain('800');
  });
});
