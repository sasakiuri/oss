// SPDX-License-Identifier: MIT
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AudienceView } from '../../src/renderer/Audience';
import { Target } from '../../src/renderer/Target';
import {
  clockDisplay,
  filteredShots,
  pageAt,
  publicationLabel,
  scoreText,
  selectedSlots,
} from '../../src/renderer/viewModel';
import type { AudienceState, SnapshotEntry } from '../../src/shared/model';
import { publishedSnapshot, screenConfig, snapshot } from '../fixtures';

const entry = (): SnapshotEntry => ({ snapshot: snapshot(), state: 'live', receivedAt: Date.now(), error: null });
afterEach(cleanup);
describe('audience presentation integrity', () => {
  it.each([
    ['OFFICIAL', 'Official'],
    ['DRAFT', 'Draft'],
    ['UNVERIFIED', 'Unverified'],
  ] as const)(
    'renders the complete %s Final scope using result names, scores, ranks and classifications',
    (state, label) => {
      const e = { ...entry(), snapshot: publishedSnapshot() };
      e.snapshot.ranking!.state = state;
      const config = { ...screenConfig(), view: 'final' as const, autoRotate: false, slots: 1 };
      config.selections[0]!.participantIds = ['lane-one'];
      const value = { config, entries: [e], identifyUntil: 0, saved: false };
      const { container, rerender } = render(<AudienceView state={value} />);
      expect(screen.getByText('Earlier relay winner')).toBeInTheDocument();
      expect(screen.getByText('Earlier club')).toBeInTheDocument();
      expect(screen.getByText('600.0')).toBeInTheDocument();
      expect(screen.getByText('Page 1 / 2')).toBeInTheDocument();
      expect(screen.getByText(`Competition ranking · ${label}`)).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeNull();
      expect(screen.queryByText('Current run athlete')).not.toBeInTheDocument();
      expect(screen.queryByText('10.2')).not.toBeInTheDocument();
      rerender(<AudienceView state={{ ...value, config: { ...config, page: 1 } }} />);
      expect(screen.getByText('Published athlete')).toBeInTheDocument();
      expect(screen.getByText('Published club')).toBeInTheDocument();
      expect(screen.getByText('590.0')).toBeInTheDocument();
      expect(screen.getByText('2', { selector: '.rank-number' })).toBeInTheDocument();
      expect(screen.getByText('RPO')).toBeInTheDocument();
      expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();
      rerender(<AudienceView state={{ ...value, config: { ...config, autoRotate: true } }} elapsed={5000} />);
      expect(screen.getByText('Published athlete')).toBeInTheDocument();
    },
  );

  it('keeps Final result rows through publication changes, paused updates and reconfirmation', () => {
    const e = { ...entry(), snapshot: publishedSnapshot() };
    const value = {
      config: { ...screenConfig(), view: 'final' as const },
      entries: [e],
      identifyUntil: 0,
      saved: false,
    };
    const { rerender } = render(<AudienceView state={value} />);
    expect(screen.getByText('Competition ranking · Official')).toBeInTheDocument();
    const reviewed = {
      ...e,
      snapshot: { ...e.snapshot, revision: 2, ranking: { ...e.snapshot.ranking!, state: 'REVIEW_REQUIRED' as const } },
    };
    rerender(<AudienceView state={{ ...value, entries: [reviewed] }} />);
    expect(screen.getByText('Competition ranking · Review required')).toBeInTheDocument();
    expect(screen.getByText('600.0')).toBeInTheDocument();
    for (const state of ['stale', 'saved'] as const) {
      rerender(<AudienceView state={{ ...value, entries: [{ ...e, state }] }} />);
      expect(screen.queryByText(/Official/)).not.toBeInTheDocument();
      expect(screen.getByText(/publication unconfirmed/)).toBeInTheDocument();
      expect(screen.getByText('600.0')).toBeInTheDocument();
      expect(screen.getByText('590.0')).toBeInTheDocument();
    }
    rerender(<AudienceView state={value} />);
    expect(screen.getByText('Competition ranking · Official')).toBeInTheDocument();
  });

  it.each(['live', 'reference'] as const)(
    'keeps targets, competition progress and assigned places in %s Final',
    (kind) => {
      const e = entry();
      e.snapshot.participants[0]!.status = 'Eliminated · rank 8 · after shot 12';
      e.snapshot.ranking = {
        scope: 'Current competition',
        kind,
        revision: '1',
        state: 'DRAFT',
        rows: [{ id: 'athlete-one', rank: 8, name: 'Athlete', affiliation: null, total: 10.2, classification: null }],
      };
      const { container } = render(
        <AudienceView
          state={{ config: { ...screenConfig(), view: 'final' }, entries: [e], identifyUntil: 0, saved: false }}
        />,
      );
      expect(container.querySelector('[data-shot-id="shot-one"]')).not.toBeNull();
      expect(screen.getByText('MATCH', { selector: '.mode-label' })).toBeInTheDocument();
      expect(screen.getByText('Eliminated · rank 8 · after shot 12')).toBeInTheDocument();
      expect(screen.getByText('Rank').parentElement).toHaveTextContent('8');
      expect(screen.getByText('10.2', { selector: '.athlete-total > strong' })).toBeInTheDocument();
    },
  );
  it('keeps unknown scores distinct from actual zero and preserves the source scoring precision', () => {
    expect(scoreText(null)).toBe('—');
    expect(scoreText(undefined)).toBe('—');
    expect(scoreText(0, snapshot().definition)).toBe('0.0');
    expect(scoreText(10.9, snapshot().definition)).toBe('10.9');
  });
  it('draws source millimetre geometry with y up, never plots missing coordinates, and distinguishes the latest locator', () => {
    const data = snapshot();
    const original = data.participants[0]!.shots[0]!;
    const shots = [
      { ...original, x: 2, y: 3 },
      { ...original, id: 'missing', sequence: 2, x: null, y: null, score: 0 },
    ];
    const { container, rerender } = render(<Target definition={data.definition} shots={shots} zoom={2} />);
    const dot = container.querySelector('[data-shot-id="shot-one"]');
    expect(dot).toHaveAttribute('cx', '2');
    expect(dot).toHaveAttribute('cy', '-3');
    expect(dot).toHaveAttribute('r', '2.25');
    expect(container.querySelector('[data-ring="10"]')).toHaveAttribute('r', '0.25');
    expect(container.querySelector('[data-shot-id="missing"]')).toBeNull();
    expect(container.querySelector('[data-latest-helper]')).toBeNull();
    expect(screen.getByText('1 without coordinates')).toBeInTheDocument();
    rerender(<Target definition={data.definition} shots={[{ ...original, x: 25, y: 1 }]} zoom={2} />);
    expect(screen.getByText('1 outside view')).toBeInTheDocument();
    expect(container.querySelector('[data-latest-helper]')).toHaveAttribute('fill', 'none');
    expect(container.querySelector('[data-latest-helper]')).toHaveAttribute('stroke-dasharray');
  });
  it('keeps a missing fixed lane in its configured slot and follows athlete IDs through a lane change', () => {
    const config = screenConfig();
    config.selections[0]!.participantIds = ['lane-one', 'absent-lane'];
    let slots = selectedSlots(config, [entry()]);
    expect(slots.map((s) => s.participant?.id)).toEqual(['athlete-one', undefined]);
    const moved = entry();
    moved.snapshot.participants[0]!.laneId = 'lane-two';
    slots = selectedSlots(config, [moved]);
    expect(slots.every((s) => !s.participant)).toBe(true);
    config.selections[0]!.follow = 'athlete';
    config.selections[0]!.participantIds = ['athlete-one'];
    expect(selectedSlots(config, [moved])[0]!.participant?.laneId).toBe('lane-two');
  });
  it('selects current stage, series and mode without changing authoritative totals', () => {
    const p = snapshot().participants[0]!;
    const shot = p.shots[0]!;
    p.shots = [
      shot,
      { ...shot, id: 'sighting', sequence: 2, mode: 'sighting' },
      { ...shot, id: 'older-stage', sequence: 3, stage: 1 },
      { ...shot, id: 'current', sequence: 4 },
    ];
    const config = { ...screenConfig(), shotFilter: 'series' as const };
    expect(filteredShots(p, config).map((s) => s.id)).toEqual(['shot-one', 'current']);
    expect(filteredShots(p, { ...config, shotFilter: 'recent', recentShots: 2 }).map((s) => s.id)).toEqual([
      'older-stage',
      'current',
    ]);
    expect(p.total).toBe(10.2);
    expect(p.shots).toHaveLength(4);
  });
  it.each(['sighting', 'match', 'shoot-off'] as const)('keeps every shot filter within the current %s mode', (mode) => {
    const p = snapshot().participants[0]!;
    const shot = p.shots[0]!;
    p.mode = mode;
    p.shots = [
      { ...shot, id: 'sighting', mode: 'sighting', sequence: 1 },
      { ...shot, id: 'match', mode: 'match', sequence: 2 },
      { ...shot, id: 'shoot-off', mode: 'shoot-off', sequence: 3 },
    ];
    for (const shotFilter of ['all', 'series', 'recent'] as const)
      expect(filteredShots(p, { ...screenConfig(), shotFilter }).map((s) => s.id)).toEqual([mode]);
    expect(p.shots).toHaveLength(3);
    expect(p.total).toBe(10.2);
  });
  it('does not present the last sighting shot as a match shot after a mode transition', () => {
    const e = entry();
    e.snapshot.participants[0]!.shots[0]!.mode = 'sighting';
    const { container } = render(
      <AudienceView state={{ config: screenConfig(), entries: [e], identifyUntil: 0, saved: false }} />,
    );
    expect(screen.getByText('MATCH', { selector: '.mode-label' })).toBeInTheDocument();
    expect(screen.getByText('No shots')).toBeInTheDocument();
    expect(container.querySelector('[data-shot-id]')).toBeNull();
  });
  it('uses independent stable pagination and covers the final partial page', () => {
    const config = { ...screenConfig(), slots: 4, pageSeconds: 5 };
    expect(pageAt(config, 10, 0)).toMatchObject({ page: 0, pages: 3, start: 0 });
    expect(pageAt(config, 10, 10000)).toMatchObject({ page: 2, start: 8 });
    expect(pageAt(config, 10, 15000)).toMatchObject({ page: 0, start: 0 });
    expect(pageAt({ ...config, autoRotate: false, page: 2 }, 10, 15000).page).toBe(2);
    expect(pageAt({ ...config, view: 'focus' }, 10, 5000)).toMatchObject({ page: 1, slots: 1 });
  });
  it.each(['sighting', 'shoot-off'] as const)(
    'does not attach a match series total to the current %s series',
    (mode) => {
      const e = entry();
      const p = e.snapshot.participants[0]!;
      p.mode = mode;
      p.series = [{ stage: p.currentStage, index: p.currentSeries, total: 52.1 }];
      p.shots.push({ ...p.shots[0]!, id: mode, mode, score: 10.9, sequence: 2 });
      render(<AudienceView state={{ config: screenConfig(), entries: [e], identifyUntil: 0, saved: false }} />);
      const currentSeries = screen.getByText(
        mode === 'sighting' ? 'Sighting series 1' : 'Shoot-off series 1',
      ).parentElement!;
      expect(within(currentSeries).getByText('—')).toBeInTheDocument();
      expect(within(currentSeries).queryByText('52.1')).not.toBeInTheDocument();
      const matchStage = screen.getByText('Match · Match sum').parentElement!;
      expect(within(matchStage).getByText('52.1')).toBeInTheDocument();
      expect(screen.getByText('Match total · 1 shots')).toBeInTheDocument();
      expect(screen.getByText('10.9', { selector: '.shot-summary > strong' })).toBeInTheDocument();
    },
  );
  it('keeps an initial sighting count distinct from confirmed match totals', () => {
    const e = entry();
    e.snapshot.definition.stages[0]!.scored = false;
    const p = e.snapshot.participants[0]!;
    p.mode = 'sighting';
    p.total = null;
    p.shotCount = 5;
    p.series = [];
    render(<AudienceView state={{ config: screenConfig(), entries: [e], identifyUntil: 0, saved: false }} />);
    expect(screen.getByText('Total · 5 shots')).toBeInTheDocument();
    expect(screen.queryByText('Match total · 5 shots')).not.toBeInTheDocument();
    expect(screen.getByText('SIGHTING', { selector: '.mode-label' })).toBeInTheDocument();
  });
  it('counts down only a confirmed live clock with a sane source and receipt time', () => {
    const e = entry();
    e.receivedAt = 10000;
    e.snapshot.capturedAt = 10000;
    const clock = {
      generation: 'g',
      revision: 1,
      state: 'running' as const,
      label: 'Match',
      remainingMs: 60000,
      sampledAt: 10000,
    };
    expect(clockDisplay(clock, e, 12000)).toMatchObject({ value: '00:58', confirmed: true });
    expect(clockDisplay(clock, { ...e, state: 'saved' }, 12000)).toMatchObject({
      value: '01:00',
      confirmed: false,
      label: 'Clock unconfirmed',
    });
    expect(clockDisplay(clock, e, 20000)).toMatchObject({ value: '01:00', confirmed: false });
    expect(clockDisplay({ ...clock, sampledAt: 13000 }, e, 12000)?.confirmed).toBe(false);
    expect(clockDisplay({ ...clock, state: 'stopped' }, e, 12000)).toMatchObject({ value: '01:00', confirmed: false });
    expect(clockDisplay({ ...clock, sampledAt: 0 }, e, 12000)).toMatchObject({ value: '00:48', confirmed: true });
  });
  it.each(['targets', 'ranking', 'final'] as const)('shows unavailable clocks explicitly in the %s view', (view) => {
    const e = entry();
    e.snapshot.ranking = { scope: 'Competition', kind: 'live', revision: 'r1', state: 'DRAFT', rows: [] };
    const { container, rerender } = render(
      <AudienceView state={{ config: { ...screenConfig(), view }, entries: [e], identifyUntil: 0, saved: false }} />,
    );
    expect(screen.getAllByText('Clock unavailable').length).toBeGreaterThan(0);
    for (const clock of container.querySelectorAll('.audience-clock')) {
      expect(clock).toHaveTextContent('Clock unavailable');
      expect(clock.querySelector('strong')).toBeNull();
      expect(clock).not.toHaveClass('confirmed');
    }
    rerender(
      <AudienceView
        state={{ config: { ...screenConfig(), view, standby: true }, entries: [e], identifyUntil: 0, saved: false }}
      />,
    );
    expect(screen.queryByText('Clock unavailable')).not.toBeInTheDocument();
  });
  it('never labels saved, stale, or overdue rankings as currently Official', () => {
    const e = entry();
    e.snapshot.ranking = {
      scope: 'Relay 1',
      kind: 'competition',
      revision: 'r1',
      state: 'OFFICIAL',
      rows: [{ id: 'athlete-one', rank: 2, name: 'Athlete A', affiliation: null, total: 0, classification: null }],
    };
    expect(publicationLabel(e)).toContain('Official');
    for (const state of ['saved', 'stale', 'syncing'] as const)
      expect(publicationLabel({ ...e, state })).not.toContain('Official');
    const value: AudienceState = {
      config: { ...screenConfig(), view: 'ranking' },
      entries: [e],
      identifyUntil: 0,
      saved: false,
    };
    render(<AudienceView state={value} now={e.receivedAt + 6000} />);
    expect(screen.queryByText(/Official/)).not.toBeInTheDocument();
    expect(screen.getByText(/publication unconfirmed/)).toBeInTheDocument();
    expect(screen.getByText('0.0')).toBeInTheDocument();
  });
  it('preserves partial-history status and exposes no audience controls or raw source errors', () => {
    const e = entry();
    e.snapshot.participants[0]!.historyComplete = false;
    e.error = 'SECRET: raw internal URL failure';
    render(<AudienceView state={{ config: screenConfig(), entries: [e], identifyUntil: 0, saved: false }} />);
    expect(screen.getByText(/Partial history/)).toBeInTheDocument();
    expect(screen.getByText(e.snapshot.participants[0]!.name!)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  });
  it.each(['stale', 'partial'] as const)(
    'keeps %s lane data from confirming live standings without changing published competition results',
    (condition) => {
      const e = entry();
      if (condition === 'stale') e.snapshot.participants[0]!.dataState = 'stale';
      else e.snapshot.participants[0]!.historyComplete = false;
      e.snapshot.ranking = {
        scope: 'Competition',
        kind: 'live',
        revision: 'r1',
        state: 'OFFICIAL',
        rows: [],
      };
      for (const kind of ['live', 'reference'] as const) {
        e.snapshot.ranking.kind = kind;
        expect(publicationLabel(e)).toContain('publication unconfirmed');
        expect(publicationLabel(e)).not.toContain('Official');
      }
      e.snapshot.ranking.kind = 'competition';
      expect(publicationLabel(e)).toBe('Competition ranking · Official');
    },
  );
  it('keeps an upstream stale Lane clock unconfirmed without stopping another live Lane', () => {
    const e = entry();
    const now = e.receivedAt;
    e.snapshot.capturedAt = now;
    e.snapshot.participants[0]!.dataState = 'stale';
    e.snapshot.participants[0]!.clock = {
      generation: 'g',
      revision: 1,
      state: 'running',
      label: 'Match',
      remainingMs: 60000,
      sampledAt: now - 10000,
    };
    e.snapshot.participants.push({
      ...structuredClone(e.snapshot.participants[0]!),
      id: 'healthy-athlete',
      laneId: 'healthy-lane',
      name: 'Healthy athlete',
      dataState: 'live',
      clock: { ...e.snapshot.participants[0]!.clock, sampledAt: now },
    });
    render(
      <AudienceView
        state={{ config: screenConfig(), entries: [e], identifyUntil: 0, saved: false }}
        now={now + 1000}
      />,
    );
    expect(screen.getByText('Clock unconfirmed')).toBeInTheDocument();
    expect(screen.getByText('01:00')).toBeInTheDocument();
    expect(screen.getByText('Updates paused')).toBeInTheDocument();
    const healthy = within(screen.getByRole('heading', { name: 'Healthy athlete' }).closest('article')!);
    expect(healthy.getByText('Live')).toBeInTheDocument();
    expect(healthy.getByText('00:59')).toBeInTheDocument();
    expect(healthy.queryByText('Clock unconfirmed')).not.toBeInTheDocument();
  });
  it('expires identification into the current configuration, including a standby change made during identification', () => {
    const e = entry();
    const value: AudienceState = { config: screenConfig(), entries: [e], identifyUntil: 15000, saved: false };
    const { container, rerender } = render(<AudienceView state={value} now={12000} />);
    expect(container.querySelector('.identify-overlay')).not.toBeNull();
    rerender(
      <AudienceView state={{ ...value, config: { ...value.config, standby: true, revision: 2 } }} now={16000} />,
    );
    expect(container.querySelector('.identify-overlay')).toBeNull();
    expect(screen.getByText('Ready for the next shot.')).toBeInTheDocument();
    expect(screen.queryByText('10.2')).not.toBeInTheDocument();
  });
});
