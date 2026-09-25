import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initialTrajectorySettings, useTrajectoryStore } from '@/app/(standalone)/labs/trajectory/_store';
import { TrajectoryClient } from '@/app/(standalone)/labs/trajectory/trajectory-client';
import { useStorageStatus } from '@/lib/browser-storage';
import { ethicalRange, sigmaFromExtremeSpread } from '@/lib/hit-probability';
import { reticleHold } from '@/lib/reticle-hold';
import { MOA_RADIANS } from '@/lib/sight-adjustment';
import { sampleTrajectory } from '@/lib/trajectory';

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

const settled = () => waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
const open = (name: RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const format = (value: number, digits: number) =>
  new Intl.NumberFormat('ja', { maximumFractionDigits: digits }).format(value);

describe('the sections below the ballistic calculator', () => {
  beforeEach(() => {
    useTrajectoryStore.setState(useTrajectoryStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('works nothing out until a section is opened', async () => {
    render(<TrajectoryClient />);
    await settled();
    for (const name of [/レティクル上の狙い位置/, /ターレットテープの印刷/, /命中確率と射程/, /ロードの比較/])
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('img', { name: '狙い位置を描いたレティクル' })).toBeNull();
  });

  it('opens a section as not entered, with its numbers blank, instead of guessing them', async () => {
    render(<TrajectoryClient />);
    await settled();
    open(/命中確率と射程/);
    expect(screen.getByText('未入力です。すべての欄を入力すると計算します。')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /求める命中確率/ })).toHaveValue(null);
    expect(screen.getByText('この確率で当たる最大距離').parentElement!).toHaveTextContent('—');
    expect(useTrajectoryStore.getState().hitProbability).toBeUndefined();
  });

  it('holds on the reticle by the drop and drift of the table, and halves it at half power on SFP', async () => {
    render(<TrajectoryClient />);
    await settled();
    open(/レティクル上の狙い位置/);
    expect(screen.queryByRole('img', { name: '狙い位置を描いたレティクル' })).toBeNull();
    fireEvent.change(screen.getByRole('spinbutton', { name: /狙う距離/ }), { target: { value: '300' } });
    const [row] = sampleTrajectory(initialTrajectorySettings, [300])!;
    const expected = (magnification: number, focalPlane: 'ffp' | 'sfp') =>
      reticleHold({
        dropRadians: Math.atan(row!.dropMeters / 300),
        driftRadians: Math.atan(row!.driftMeters / 300),
        unit: 'mil',
        focalPlane,
        calibratedMagnification: 10,
        magnification,
      })!;
    const ffp = expected(10, 'ffp');
    expect(screen.getByRole('img', { name: '狙い位置を描いたレティクル' })).toBeInTheDocument();
    // The default wind comes from nine o'clock, so the hold is up and to the left.
    expect(
      screen.getByText(new RegExp(`上に ${format(ffp.up, 2)}・左に ${format(-ffp.right, 2)}`)),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('レティクルの位置'), { target: { value: 'sfp' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /目盛りが正しい倍率/ }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /いまの倍率/ }), { target: { value: '5' } });
    const sfp = expected(5, 'sfp');
    expect(sfp.up).toBeCloseTo(ffp.up / 2, 12);
    expect(screen.getByText(new RegExp(`上に ${format(sfp.up, 2)}`))).toBeInTheDocument();
  });

  it('prints the turret tape only from its own button', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    useTrajectoryStore.getState().setClickValue({ preset: '1/4-moa', customMmPer100m: 10 });
    useTrajectoryStore
      .getState()
      .setTurretTape({ circumferenceMm: 100, clicksPerRevolution: 60, step: 50, maxRange: 300 });
    render(<TrajectoryClient />);
    await settled();
    open(/ターレットテープの印刷/);
    expect(screen.getByRole('img', { name: '印刷するテープのプレビュー' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'テープを印刷する' }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it('gives the furthest distance at the chance asked for, from the group', async () => {
    const hitProbability = {
      groupMeasure: 'extreme-spread',
      groupSize: 1,
      groupUnit: 'moa',
      groupShots: 5,
      velocitySd: 0,
      windSd: 0,
      rangeSd: 0,
      threshold: 90,
    } as const;
    useTrajectoryStore.getState().setHitProbability(hitProbability);
    render(<TrajectoryClient />);
    await settled();
    open(/命中確率と射程/);
    const sigma = sigmaFromExtremeSpread(hitProbability.groupSize, hitProbability.groupShots)!;
    const range = ethicalRange(
      initialTrajectorySettings,
      {
        groupSigmaRadians: sigma * MOA_RADIANS,
        velocitySd: { value: 0, unit: 'mps' },
        windSd: { value: 0, unit: 'mps' },
        rangeSdMeters: 0,
      },
      0.05,
      hitProbability.threshold / 100,
      initialTrajectorySettings.maxRange,
    );
    expect(range?.kind).toBe('within');
    const figure = screen.getByText('この確率で当たる最大距離').parentElement!;
    expect(figure).toHaveTextContent(`${format((range as { rangeMeters: number }).rangeMeters, 0)} m`);
    expect(screen.getByRole('region', { name: '距離ごとの命中確率' })).toBeInTheDocument();
  });

  it('adds a load to compare and lays the two side by side', async () => {
    render(<TrajectoryClient />);
    await settled();
    open(/ロードの比較/);
    fireEvent.click(screen.getByRole('button', { name: '比べるロードを追加' }));
    const table = within(screen.getByRole('region', { name: 'ロードごとの落差とエネルギー' })).getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /^A/ })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /^B/ })).toBeInTheDocument();
    expect(useTrajectoryStore.getState().comparison).toHaveLength(1);
  });
});
