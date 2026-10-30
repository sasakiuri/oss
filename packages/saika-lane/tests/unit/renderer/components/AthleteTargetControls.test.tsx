// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SideMenu } from '@/renderer/presentation/components/SideMenu';
import { SidePanel } from '@/renderer/presentation/components/SidePanel';
import { useAppKeyboardShortcuts } from '@/renderer/presentation/hooks/useAppKeyboardShortcuts';
import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
import { refreshAthleteTargetControl } from '@/renderer/presentation/stores/athleteTargetControl';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import { competitionService } from '@/renderer/services/competitionService';
import type { CompetitionStateDto } from '@/shared/ipc/contracts';

const { restart, switchMode } = vi.hoisted(() => ({ restart: vi.fn(), switchMode: vi.fn() }));
vi.mock('@/renderer/presentation/hooks/useCompetition', () => ({
  useCompetition: () => ({ startStage: restart, startNextSeries: restart, advanceStage: restart, endStage: restart }),
}));
vi.mock('@/renderer/presentation/hooks/useSession', () => ({ useSession: () => ({ switchMode }) }));
vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: { setAthleteTargetMode: vi.fn(), getCompetitionState: vi.fn() },
}));

const control: NonNullable<CompetitionStateDto['athleteTargetControl']> = {
  officialSighting: false,
  sightingAllowed: true,
  matchAllowed: true,
  matchUnavailableReason: null,
  selected: null,
  effective: 'MATCH',
};
function dto(mode: 'SIGHTING' | 'MATCH'): CompetitionStateDto {
  return {
    id: 'comp-1',
    sessionId: 'session-1',
    phase: 'ACTIVE',
    currentStageIndex: 1,
    currentSeriesIndex: 2,
    seriesShotCount: 0,
    timer: { remainingSeconds: 600, totalSeconds: 1000, formattedRemaining: '10:00', isExpired: false },
    currentStageName: 'Match',
    scored: true,
    shotsPerSeries: 10,
    acc: 'DECIMAL',
    interruption: null,
    athleteTargetControl: { ...control, selected: mode, effective: mode },
  };
}
function Harness() {
  const actions = useModeSwitchActions();
  useAppKeyboardShortcuts({
    screen: 'main',
    onPreparationClick: actions.handlePreparationClick,
    onMatchClick: actions.handleMatchClick,
    onNextStageClick: actions.handleNextStageClick,
  });
  return (
    <>
      <SideMenu
        onPreparationClick={actions.handlePreparationClick}
        onMatchClick={actions.handleMatchClick}
        onNextStageClick={actions.handleNextStageClick}
        onZoomClick={vi.fn()}
        onSettingsClick={vi.fn()}
      />
      <SidePanel />
      {actions.confirmation && <div role="dialog">{actions.confirmation.message}</div>}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useCompetitionStore.getState().resetCompetition();
  useSessionStore.getState().resetSession();
  useCompetitionStore.setState({
    competitionId: 'comp-1',
    phase: 'ACTIVE',
    stageIndex: 1,
    seriesIndex: 2,
    scored: true,
    currentStageName: 'Match',
    remainingSeconds: 600,
    totalSeconds: 1000,
    acc: 'DECIMAL',
    interruption: null,
    athleteTargetControl: control,
    athleteTargetControlLoaded: true,
  });
  useSessionStore.setState({ currentSessionId: 'session-1', mode: 'SIGHTING' });
  useSessionStore.getState().addShot({
    id: 'shot-match',
    shotNumber: 1,
    x: 0,
    y: 0,
    score: 100,
    innerTen: false,
    timestamp: new Date().toISOString(),
    mode: 'MATCH',
    isRecorded: true,
  });
  useSessionStore.getState().addShot({
    id: 'shot-sight',
    shotNumber: 2,
    x: 0,
    y: 0,
    score: 90,
    innerTen: false,
    timestamp: new Date().toISOString(),
    mode: 'SIGHTING',
    isRecorded: false,
  });
  vi.mocked(competitionService.setAthleteTargetMode).mockImplementation(async ({ mode }) => dto(mode));
});

describe.each([null, 'director-comp'])('athlete controls with Director membership %s', (membership) => {
  beforeEach(() =>
    useDirectorMembershipStore.setState({ membership: { competitionId: membership, revision: 1 }, hydrated: true }),
  );

  it.each(['mouse', 'keys'])(
    'selects immediately through %s without restart, confirmation or score changes',
    async (input) => {
      const before = useSessionStore.getState();
      render(<Harness />);
      expect(screen.getByRole('status', { name: 'Current Mode: Match' })).toBeVisible();
      expect(screen.getAllByText('10.0').find((element) => element.classList.contains('text-5xl'))).toBeVisible();
      expect(screen.queryByText('19.0')).not.toBeInTheDocument();
      expect(screen.getByText('~ 10.00')).toBeVisible();
      for (const mode of ['SIGHTING', 'MATCH'] as const) {
        await act(async () => {
          if (input === 'keys') fireEvent.keyDown(window, { code: mode === 'SIGHTING' ? 'Numpad1' : 'Numpad2' });
          else fireEvent.click(screen.getByRole('button', { name: mode === 'SIGHTING' ? 'Sighting' : 'Match' }));
        });
        expect(screen.getByRole('button', { name: mode === 'SIGHTING' ? 'Sighting' : 'Match' })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      }
      expect(competitionService.setAthleteTargetMode).toHaveBeenCalledTimes(2);
      expect(competitionService.setAthleteTargetMode).toHaveBeenCalledWith({
        competitionId: 'comp-1',
        stageIndex: 1,
        seriesIndex: 2,
        mode: 'SIGHTING',
      });
      expect(restart).not.toHaveBeenCalled();
      expect(switchMode).not.toHaveBeenCalled();
      expect(useSessionStore.getState()).toEqual(before);
      expect(useCompetitionStore.getState()).toMatchObject({
        stageIndex: 1,
        seriesIndex: 2,
        remainingSeconds: 600,
        totalSeconds: 1000,
      });
    },
  );

  it('requires Sighting before Match and keeps Numpad2 inert', async () => {
    useCompetitionStore.setState({
      athleteTargetControl: { ...control, matchAllowed: false, matchUnavailableReason: 'SIGHTING_REQUIRED' },
    });
    render(<Harness />);
    const match = screen.getByRole('button', { name: 'Match' });
    expect(match).toBeDisabled();
    expect(match).toHaveAccessibleDescription('Switch to Sighting before selecting Match.');
    expect(screen.getByRole('button', { name: 'Sighting' })).toBeEnabled();
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Numpad2' });
      fireEvent.click(match);
    });
    expect(competitionService.setAthleteTargetMode).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
  });

  it('displays an unnumbered extra and the commanded reset status alongside raw device modes', () => {
    useSessionStore.setState({
      nullificationMessage: 'Extra shot nullified. Target reset to Sighting.',
      nullifiedExtras: [
        {
          id: 'extra',
          receivedAt: new Date().toISOString(),
          previousPosition: 'KNEELING',
          deviceScoreX10: 100,
          reportedMode: 'MATCH',
          detail: 'ISSF 6.10.4(c) / 7.7.3',
        },
      ],
    });
    render(<Harness />);
    expect(screen.getByText(/Nullified extra — previous Kneeling position/)).toBeVisible();
    expect(screen.getByText('Not scored · ISSF 6.10.4(c) / 7.7.3')).toBeVisible();
    expect(screen.getByLabelText('No shot ordinal')).toHaveTextContent('—');
    expect(screen.getByText(/Device mode: MATCH/)).toBeVisible();
    expect(screen.getByText('Extra shot nullified. Target reset to Sighting.')).toBeVisible();
  });

  it('keeps Numpad1 inert after the cutoff and shows why Sighting is disabled', async () => {
    useCompetitionStore.setState({ athleteTargetControl: { ...control, sightingAllowed: false } });
    render(<Harness />);
    const sighting = screen.getByRole('button', { name: 'Sighting' });
    expect(sighting).toBeDisabled();
    expect(sighting).toHaveAccessibleDescription('Sighting is unavailable after the first Match shot of this series');
    expect(sighting).toHaveAttribute(
      'title',
      'Sighting: Sighting is unavailable after the first Match shot of this series',
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'Sighting is unavailable after the first Match shot of this series',
    );
    expect(screen.getByRole('note')).toBeVisible();
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Numpad1' });
      fireEvent.click(sighting);
    });
    expect(restart).not.toHaveBeenCalled();
    expect(competitionService.setAthleteTargetMode).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for the new series projection without falling back to a restart', async () => {
    useCompetitionStore.setState({
      acc: 'DECIMAL',
      interruption: null,
      athleteTargetControl: null,
      athleteTargetControlLoaded: false,
      athleteTargetControlPending: true,
    });
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Preparation' })).toHaveAttribute('aria-disabled', 'true');
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Numpad1' });
      fireEvent.keyDown(window, { code: 'Numpad2' });
    });
    expect(restart).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(
    ['mouse1', 'mouse2', 'key1', 'key2'].flatMap((input) =>
      ['error', 'discarded'].map((failure) => ({ input, failure })),
    ),
  )(
    'recovers an unloaded projection through $input after $failure without running a restart or selection',
    async ({ input, failure }) => {
      useCompetitionStore.setState({ athleteTargetControl: null, athleteTargetControlLoaded: false });
      if (failure === 'error')
        vi.mocked(competitionService.getCompetitionState).mockRejectedValueOnce(new Error('query unavailable'));
      else
        vi.mocked(competitionService.getCompetitionState).mockResolvedValueOnce({
          ...dto('MATCH'),
          currentSeriesIndex: 99,
        });
      await refreshAthleteTargetControl();
      render(<Harness />);
      for (const name of ['Preparation', 'Match']) {
        expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name })).toHaveAccessibleDescription(
          'Target controls are unavailable. Press either mode button to retry.',
        );
      }
      expect(screen.getByRole('note')).toHaveTextContent('Target controls are unavailable');
      vi.mocked(competitionService.getCompetitionState).mockResolvedValue({
        ...dto('MATCH'),
        acc: 'DECIMAL',
        interruption: null,
        athleteTargetControl: control,
      });
      await act(async () => {
        if (input.startsWith('key')) fireEvent.keyDown(window, { code: input.endsWith('1') ? 'Numpad1' : 'Numpad2' });
        else fireEvent.click(screen.getByRole('button', { name: input.endsWith('1') ? 'Preparation' : 'Match' }));
      });
      expect(competitionService.getCompetitionState).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'Sighting' })).toBeEnabled();
      expect(restart).not.toHaveBeenCalled();
      expect(switchMode).not.toHaveBeenCalled();
      expect(competitionService.setAthleteTargetMode).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await act(async () => {
        if (input.startsWith('key')) fireEvent.keyDown(window, { code: input.endsWith('1') ? 'Numpad1' : 'Numpad2' });
        else fireEvent.click(screen.getByRole('button', { name: input.endsWith('1') ? 'Sighting' : 'Match' }));
      });
      expect(competitionService.setAthleteTargetMode).toHaveBeenCalledExactlyOnceWith({
        competitionId: 'comp-1',
        stageIndex: 1,
        seriesIndex: 2,
        mode: input.endsWith('1') ? 'SIGHTING' : 'MATCH',
      });
      expect(restart).not.toHaveBeenCalled();
    },
  );

  it('keeps both athlete modes unavailable during official sighting', async () => {
    useCompetitionStore.getState().setAthleteTargetControl({
      ...control,
      officialSighting: true,
      sightingAllowed: false,
      matchAllowed: false,
      matchUnavailableReason: null,
      selected: 'MATCH',
      effective: 'SIGHTING',
    });
    render(<Harness />);
    for (const label of ['Sighting', 'Match']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
      expect(screen.getByRole('button', { name: label })).toHaveAccessibleDescription(
        'Official sighting is in progress',
      );
    }
    expect(screen.getByRole('status', { name: 'Current Mode: Sighting' })).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent('Official sighting is in progress');
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Numpad1' });
      fireEvent.keyDown(window, { code: 'Numpad2' });
      fireEvent.click(screen.getByRole('button', { name: 'Sighting' }));
      fireEvent.click(screen.getByRole('button', { name: 'Match' }));
    });
    expect(competitionService.setAthleteTargetMode).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not infer official sighting solely from two disallowed choices', () => {
    useCompetitionStore.getState().setAthleteTargetControl({
      ...control,
      officialSighting: false,
      sightingAllowed: false,
      matchAllowed: false,
      matchUnavailableReason: null,
    });
    render(<Harness />);
    expect(screen.getByRole('note')).not.toHaveTextContent('Official sighting is in progress');
    expect(screen.getByRole('button', { name: 'Sighting' })).toHaveAccessibleDescription(
      'Sighting is unavailable after the first Match shot of this series',
    );
  });

  it('disables Match in the final sighting-only changeover', async () => {
    useCompetitionStore.setState({ athleteTargetControl: { ...control, matchAllowed: false, effective: 'SIGHTING' } });
    render(<Harness />);
    const match = screen.getByRole('button', { name: 'Match' });
    expect(match).toBeDisabled();
    expect(match).toHaveAccessibleDescription('This position change allows Sighting only');
    expect(match).toHaveAttribute('title', 'Match: This position change allows Sighting only');
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Numpad2' });
    });
    expect(competitionService.setAthleteTargetMode).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
  });

  it('preserves Numpad3 restrictions during the athlete series', async () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Next Stage' })).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Numpad3' });
    });
    expect(restart).not.toHaveBeenCalled();
  });
});
