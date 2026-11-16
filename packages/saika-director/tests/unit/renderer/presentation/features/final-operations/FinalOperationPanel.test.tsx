import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinalOperationPanel } from '@/renderer/presentation/features/final-operations/FinalOperationPanel';
import { finalOperationsService } from '@/renderer/services';
import type { FinalOperationRunDto } from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { getByCompetition, confirmStep, skipStep } = vi.mocked(finalOperationsService);

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_A = '22222222-2222-4222-8222-222222222222';
const LANE_B = '33333333-3333-4333-8333-333333333333';

function shootOffRun(stepText: string): FinalOperationRunDto {
  const currentStep: FinalOperationRunDto['steps'][number] = {
    step: {
      id: `step-${stepText}`,
      actor: 'CRO',
      kind: 'CHECK',
      text: stepText,
      ruleReference: '6.15.3',
      timing: { mode: 'MANUAL' },
      effect: { type: 'NONE' },
    },
    status: 'AWAITING_CONFIRMATION',
    confirmationEntryId: null,
    eligibleLaneIds: [],
    executionAttempts: [],
    scheduledFor: null,
  };
  return {
    id: '44444444-4444-4444-8444-444444444444',
    competitionId: COMPETITION_ID,
    eventId: null,
    competitionTypeId: 'AR10_FINAL',
    rulePackId: 'ISSF:2026:AR10:FINAL',
    scriptVersion: '1',
    scriptSource: null,
    scheduledStartAt: '2026-11-16T01:00:00.000Z',
    createdBy: 'Jury Chair',
    createdAt: '2026-11-16T00:50:00.000Z',
    status: 'ACTIVE',
    currentBranch: 'SHOOT_OFF',
    currentStep,
    steps: [currentStep],
    shootOff: {
      iteration: 1,
      checkpointStepId: 'checkpoint',
      eligibleLaneIds: [LANE_A, LANE_B],
      units: [
        { unitId: LANE_A, label: 'FP 1', laneIds: [LANE_A] },
        { unitId: LANE_B, label: 'FP 2', laneIds: [LANE_B] },
      ],
      shotsPerLane: 1,
      status: 'ACTIVE',
      steps: [currentStep],
      currentStep,
      shots: [],
    },
    shootOffShots: [],
    entries: [],
  };
}

function mainRun(stepText: string): FinalOperationRunDto {
  return { ...shootOffRun(stepText), currentBranch: 'MAIN', shootOff: null };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const renderPanel = () =>
  render(
    <FinalOperationPanel
      competitionId={COMPETITION_ID}
      competitionTypeId="AR10_FINAL"
      competitorUnit="INDIVIDUAL"
      phase="MATCH"
      lanes={[]}
    />,
  );

const pollOnce = () => act(() => vi.advanceTimersByTimeAsync(1_000));

describe('FinalOperationPanel shoot-off refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a command error while the shoot-off view refreshes every second', async () => {
    getByCompetition.mockResolvedValue(ok(shootOffRun('Check the shoot-off targets')));
    confirmStep.mockResolvedValue(fail('The step was already confirmed'));
    renderPanel();
    await screen.findByText('Check the shoot-off targets');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and execute' }));
    await screen.findByText('The step was already confirmed');

    await pollOnce();
    await pollOnce();

    expect(getByCompetition).toHaveBeenCalledTimes(3);
    expect(screen.getByText('The step was already confirmed')).toBeInTheDocument();
  });

  it('keeps the run returned by a command when an older refresh returns later', async () => {
    const olderRefresh = deferred<ReturnType<typeof ok<FinalOperationRunDto>>>();
    getByCompetition
      .mockResolvedValueOnce(ok(shootOffRun('Check the shoot-off targets')))
      .mockReturnValueOnce(olderRefresh.promise);
    skipStep.mockResolvedValue(ok(shootOffRun('Announce the shoot-off')));
    renderPanel();
    await screen.findByText('Check the shoot-off targets');

    await pollOnce();
    fireEvent.change(screen.getByLabelText('Confirmation / exception note'), {
      target: { value: 'Targets checked by the Jury' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip with reason' }));
    await screen.findByText('Announce the shoot-off');

    await act(async () => olderRefresh.resolve(ok(shootOffRun('Check the shoot-off targets'))));

    expect(screen.getByText('Announce the shoot-off')).toBeInTheDocument();
    expect(screen.queryByText('Check the shoot-off targets')).not.toBeInTheDocument();
  });

  it('reports a failed refresh without hiding the command error', async () => {
    getByCompetition.mockResolvedValueOnce(ok(shootOffRun('Check the shoot-off targets')));
    getByCompetition.mockResolvedValue(fail('Director database is busy'));
    confirmStep.mockResolvedValue(fail('The step was already confirmed'));
    renderPanel();
    await screen.findByText('Check the shoot-off targets');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and execute' }));
    await screen.findByText('The step was already confirmed');
    await pollOnce();

    expect(screen.getByText('The step was already confirmed')).toBeInTheDocument();
    expect(screen.getByText('Director database is busy')).toBeInTheDocument();
  });
});

describe('FinalOperationPanel manual refresh', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('applies a manual refresh that was in flight when a command ended without a run', async () => {
    const refresh = deferred<ReturnType<typeof ok<FinalOperationRunDto>>>();
    getByCompetition.mockResolvedValueOnce(ok(mainRun('Check the targets'))).mockReturnValueOnce(refresh.promise);
    confirmStep.mockResolvedValue(fail('The step was already confirmed'));
    renderPanel();
    await screen.findByText('Check the targets');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and execute' }));
    await screen.findByText('The step was already confirmed');
    await act(async () => refresh.resolve(ok(mainRun('Announce the Final'))));

    expect(screen.getByText('Announce the Final')).toBeInTheDocument();
    expect(screen.getByText('The step was already confirmed')).toBeInTheDocument();
  });

  it('reports a manual refresh failure that arrives after a command ended without a run', async () => {
    const refresh = deferred<ReturnType<typeof fail>>();
    getByCompetition.mockResolvedValueOnce(ok(mainRun('Check the targets'))).mockReturnValueOnce(refresh.promise);
    confirmStep.mockResolvedValue(fail('The step was already confirmed'));
    renderPanel();
    await screen.findByText('Check the targets');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and execute' }));
    await screen.findByText('The step was already confirmed');
    await act(async () => refresh.resolve(fail('Director database is busy')));

    expect(screen.getByText('Director database is busy')).toBeInTheDocument();
  });
});
