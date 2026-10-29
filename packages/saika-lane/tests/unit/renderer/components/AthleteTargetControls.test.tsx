// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SideMenu } from '@/renderer/presentation/components/SideMenu';
import { SidePanel } from '@/renderer/presentation/components/SidePanel';
import { useAppKeyboardShortcuts } from '@/renderer/presentation/hooks/useAppKeyboardShortcuts';
import { useModeSwitchActions } from '@/renderer/presentation/hooks/useModeSwitchActions';
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
  sightingAllowed: true,
  matchAllowed: true,
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
    athleteTargetControl: control,
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

  it('keeps Numpad1 inert after the cutoff and shows why Sighting is disabled', async () => {
    useCompetitionStore.setState({ athleteTargetControl: { ...control, sightingAllowed: false } });
    render(<Harness />);
    const sighting = screen.getByRole('button', { name: 'Sighting' });
    expect(sighting).toBeDisabled();
    expect(sighting).toHaveAccessibleDescription('Sighting is unavailable after the first Match shot of this series');
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
    useCompetitionStore.setState({ athleteTargetControl: null, athleteTargetControlPending: true });
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Preparation' })).toBeDisabled();
    await act(async () => {
      fireEvent.keyDown(window, { code: 'Numpad1' });
      fireEvent.keyDown(window, { code: 'Numpad2' });
    });
    expect(restart).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables Match in the final sighting-only changeover', async () => {
    useCompetitionStore.setState({ athleteTargetControl: { ...control, matchAllowed: false, effective: 'SIGHTING' } });
    render(<Harness />);
    const match = screen.getByRole('button', { name: 'Match' });
    expect(match).toBeDisabled();
    expect(match).toHaveAccessibleDescription('This position change allows Sighting only');
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
