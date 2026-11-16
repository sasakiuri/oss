import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MixedTeamFinalControlPanel } from '@/renderer/presentation/features/mixed-team-final-control/MixedTeamFinalControlPanel';
import { mixedTeamFinalControlService, mqttService } from '@/renderer/services';
import type {
  DirectorLaneSnapshotDto,
  MixedTeamFinalAssessmentDto,
  MixedTeamFinalDecisionDto,
} from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { list, assess, recordDecision, recordCommandBatch } = vi.mocked(mixedTeamFinalControlService);
const { retireFinalist } = vi.mocked(mqttService);

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_A = '22222222-2222-4222-8222-222222222222';
const LANE_B = '33333333-3333-4333-8333-333333333333';
const LANE_C = '44444444-4444-4444-8444-444444444444';
const LANE_D = '55555555-5555-4555-8555-555555555555';
const DECISION_ID = '66666666-6666-4666-8666-666666666666';
const COMMAND_ID = '77777777-7777-4777-8777-777777777777';

function lane(laneId: string, teamId: string, gender: 'F' | 'M') {
  return {
    laneId,
    laneAlias: null,
    assignment: {
      competitionId: COMPETITION_ID,
      athlete: { id: `${teamId}-${gender}`, name: `${teamId} ${gender}`, gender, teamId, teamName: teamId },
    },
    score: null,
    competitionState: null,
  };
}
const lanes = [
  lane(LANE_A, 'TEAM-1', 'F'),
  lane(LANE_B, 'TEAM-1', 'M'),
  lane(LANE_C, 'TEAM-2', 'F'),
  lane(LANE_D, 'TEAM-2', 'M'),
] as unknown as DirectorLaneSnapshotDto[];

const ready: MixedTeamFinalAssessmentDto = {
  status: 'READY',
  afterShot: 18,
  expectedRank: 4,
  activeTeamIds: ['TEAM-1', 'TEAM-2'],
  candidateTeamIds: ['TEAM-2'],
  guidance: 'Retire the lowest team.',
};

const pending: MixedTeamFinalDecisionDto = {
  id: DECISION_ID,
  competitionId: COMPETITION_ID,
  eventId: null,
  competitionTypeId: 'AR10_MIXED_TEAM_FINAL',
  afterShot: 18,
  rank: 4,
  selectedTeamId: 'TEAM-2',
  memberLaneIds: [LANE_C, LANE_D],
  scoreSnapshot: [],
  tiedTeamIds: [],
  resolution: 'CLEAR_LOWEST',
  resolutionStatement: null,
  officialName: 'Jury A',
  ruleReference: 'ISSF 6.18',
  recordedAt: '2026-09-07T01:00:00.000Z',
  voided: false,
  commandCompleted: false,
  latestLaneStatuses: {},
  commandAttempts: [],
};

function retired(laneId: string) {
  return ok({
    commandId: COMMAND_ID,
    action: 'retire-finalist' as const,
    success: true,
    lanes: [{ laneId, status: 'done' as const }],
  });
}

function renderPanel() {
  render(
    <MixedTeamFinalControlPanel
      competitionId={COMPETITION_ID}
      competitionTypeId="AR10_MIXED_TEAM_FINAL"
      lanes={lanes}
    />,
  );
}

describe('MixedTeamFinalControlPanel failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(ok([]));
    assess.mockResolvedValue(ok(ready));
  });

  it('shows the decision list failure before the assessment failure', async () => {
    list.mockResolvedValue(fail('Team decisions are unavailable'));
    assess.mockResolvedValue(fail('The team assessment is unavailable'));
    renderPanel();
    expect(await screen.findByText('Team decisions are unavailable')).toBeInTheDocument();
    expect(screen.queryByText('The team assessment is unavailable')).not.toBeInTheDocument();

    list.mockResolvedValue(ok([]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('The team assessment is unavailable')).toBeInTheDocument();
  });

  it('shows a failed decision record as its message without commanding the Lanes', async () => {
    recordDecision.mockResolvedValue(fail('Rank 4 is already decided'));
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Official name'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record and retire rank 4' }));
    expect(await screen.findByText('Rank 4 is already decided')).toBeInTheDocument();
    expect(retireFinalist).not.toHaveBeenCalled();
  });

  it('shows a failed batch record, a partial retirement and a rejected command as text', async () => {
    list.mockResolvedValue(ok([pending]));
    retireFinalist.mockImplementation(async ({ laneId }) =>
      laneId === LANE_C ? fail('Lane C is offline') : retired(laneId),
    );
    recordCommandBatch.mockResolvedValueOnce(fail('The team ledger is read-only'));
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Official name'), { target: { value: 'Jury B' } });
    const retry = screen.getByRole('button', { name: 'Retry TEAM-2' });
    fireEvent.click(retry);
    expect(await screen.findByText('The team ledger is read-only')).toBeInTheDocument();
    expect(recordCommandBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: DECISION_ID,
        laneResults: [{ laneId: LANE_D, commandId: COMMAND_ID, status: 'DONE', error: null }],
      }),
    );

    recordCommandBatch.mockResolvedValue(ok(pending));
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(
      await screen.findByText('Mixed Team retirement was only partially completed; retry the pending member Lane(s)'),
    ).toBeInTheDocument();

    retireFinalist.mockRejectedValue('Lane bridge closed');
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(await screen.findByText('Lane bridge closed')).toBeInTheDocument();
  });
});
