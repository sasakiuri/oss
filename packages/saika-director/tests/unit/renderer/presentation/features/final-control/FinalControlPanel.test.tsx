import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinalControlPanel } from '@/renderer/presentation/features/final-control/FinalControlPanel';
import { finalControlService, mqttService } from '@/renderer/services';
import type {
  DirectorLaneSnapshotDto,
  FinalCheckpointAssessmentDto,
  FinalControlDecisionDto,
} from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { list, assess, recordDecision, recordCommandResult, voidDecision } = vi.mocked(finalControlService);
const { retireFinalist } = vi.mocked(mqttService);

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const LANE_A = '22222222-2222-4222-8222-222222222222';
const LANE_B = '33333333-3333-4333-8333-333333333333';
const DECISION_ID = '44444444-4444-4444-8444-444444444444';
const COMMAND_ID = '55555555-5555-4555-8555-555555555555';

const lanes = [
  { laneId: LANE_A, laneAlias: null, assignment: { athlete: { name: 'Athlete A' } }, score: null },
  { laneId: LANE_B, laneAlias: null, assignment: { athlete: { name: 'Athlete B' } }, score: null },
] as unknown as DirectorLaneSnapshotDto[];

const ready: FinalCheckpointAssessmentDto = {
  status: 'READY',
  afterShot: 12,
  expectedRank: 8,
  activeLaneIds: [LANE_A, LANE_B],
  candidateLaneIds: [LANE_B],
  resolutionRequirement: 'CLEAR_LOWEST',
  ruleReference: 'ISSF 6.17.4',
  guidance: 'Retire the lowest-ranked finalist.',
};

const pending: FinalControlDecisionDto = {
  id: DECISION_ID,
  competitionId: COMPETITION_ID,
  eventId: null,
  competitionTypeId: 'AR10_FINAL',
  participantCount: 2,
  afterShot: 12,
  rank: 8,
  selectedLaneId: LANE_B,
  scoreSnapshot: [],
  tiedLaneIds: [],
  resolution: 'CLEAR_LOWEST',
  resolutionStatement: null,
  officialName: 'Jury A',
  ruleReference: 'ISSF 6.17.4',
  recordedAt: '2026-09-07T01:00:00.000Z',
  voided: false,
  commandCompleted: false,
  commandAttempts: [],
};

function renderPanel() {
  render(<FinalControlPanel competitionId={COMPETITION_ID} competitionTypeId="AR10_FINAL" lanes={lanes} />);
}

describe('FinalControlPanel failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue(ok([]));
    assess.mockResolvedValue(ok(ready));
  });

  it('shows the decision list failure before the assessment failure', async () => {
    list.mockResolvedValue(fail('Final decisions are unavailable'));
    assess.mockResolvedValue(fail('The assessment is unavailable'));
    renderPanel();
    expect(await screen.findByText('Final decisions are unavailable')).toBeInTheDocument();
    expect(screen.queryByText('The assessment is unavailable')).not.toBeInTheDocument();

    list.mockResolvedValue(ok([]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('The assessment is unavailable')).toBeInTheDocument();
  });

  it('shows a failed decision record as its message without commanding the Lane', async () => {
    recordDecision.mockResolvedValue(fail('Rank 8 is already decided'));
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Official name'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record and retire rank 8' }));
    expect(await screen.findByText('Rank 8 is already decided')).toBeInTheDocument();
    expect(retireFinalist).not.toHaveBeenCalled();
  });

  it('shows a failed Lane command, a rejected command and a failed command record as text', async () => {
    list.mockResolvedValue(ok([pending]));
    retireFinalist.mockResolvedValueOnce(fail('MQTT broker is not connected'));
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Official name'), { target: { value: 'Jury B' } });
    const retry = screen.getByRole('button', { name: 'Retry Lane command for rank 8' });
    fireEvent.click(retry);
    expect(await screen.findByText('MQTT broker is not connected')).toBeInTheDocument();
    expect(recordCommandResult).not.toHaveBeenCalled();

    retireFinalist.mockRejectedValueOnce('Lane bridge closed');
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(await screen.findByText('Lane bridge closed')).toBeInTheDocument();

    retireFinalist.mockResolvedValueOnce(
      ok({
        commandId: COMMAND_ID,
        action: 'retire-finalist' as const,
        success: true,
        lanes: [{ laneId: LANE_B, status: 'done' as const }],
      }),
    );
    recordCommandResult.mockResolvedValue(fail('The decision ledger is read-only'));
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    expect(await screen.findByText('The decision ledger is read-only')).toBeInTheDocument();
    expect(recordCommandResult).toHaveBeenCalledWith({
      decisionId: DECISION_ID,
      commandId: COMMAND_ID,
      status: 'DONE',
      statement: 'Lane retired as rank 8 after shot 12',
      officialName: 'Jury B',
    });
  });

  it('shows a failed void as its message', async () => {
    list.mockResolvedValue(ok([pending]));
    voidDecision.mockResolvedValue(fail('The decision is already complete'));
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Official name'), { target: { value: 'Jury B' } });
    fireEvent.change(screen.getByLabelText('Retry / void note'), { target: { value: 'Wrong finalist' } });
    fireEvent.click(screen.getByRole('button', { name: 'Void pending decision' }));
    expect(await screen.findByText('The decision is already complete')).toBeInTheDocument();
    expect(voidDecision).toHaveBeenCalledWith({
      decisionId: DECISION_ID,
      reason: 'Wrong finalist',
      officialName: 'Jury B',
    });
  });
});
