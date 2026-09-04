import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EstComplaintInbox } from '@/renderer/presentation/features/est-complaints';
import type { EstComplaintObservationDto } from '@/shared/ipc/contracts';

const competitionId = '11111111-1111-4111-8111-111111111111';
const signalId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';

const { listByCompetition, openTargetExamination } = vi.hoisted(() => ({
  listByCompetition: vi.fn(),
  openTargetExamination: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  estComplaintsService: { listByCompetition, openTargetExamination },
}));

describe('EstComplaintInbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByCompetition.mockResolvedValue({ success: true, data: [observation()] });
    openTargetExamination.mockResolvedValue({
      success: true,
      data: {
        created: true,
        targetExaminationCaseId: caseId,
        observation: observation({
          targetExaminationCaseId: caseId,
          linkedBy: 'RTS A',
          linkedAt: '2026-09-04T01:00:01.000Z',
        }),
      },
    });
  });

  it('requires an explicit official and opens an examination without presenting the advisory as a ruling', async () => {
    const onCaseOpened = vi.fn();
    render(
      <EstComplaintInbox
        competitionId={competitionId}
        observedSignalIds={[signalId]}
        relayNumber={2}
        onCaseOpened={onCaseOpened}
      />,
    );

    await waitFor(() => expect(listByCompetition).toHaveBeenCalledWith({ competitionId }));
    expect(screen.getByText(/Advisory only; the Jury determines/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open examination' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Official opening the examination'), { target: { value: 'RTS A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open examination' }));

    await waitFor(() =>
      expect(openTargetExamination).toHaveBeenCalledWith({ signalId, openedBy: 'RTS A', relayNumber: 2 }),
    );
    expect(await screen.findByText(`Case ${caseId.slice(0, 8)}`)).toBeInTheDocument();
    expect(onCaseOpened).toHaveBeenCalledWith(caseId);
  });
});

function observation(overrides: Partial<EstComplaintObservationDto> = {}): EstComplaintObservationDto {
  return {
    signalId,
    laneId: '44444444-4444-4444-8444-444444444444',
    firingPointNumber: 7,
    status: 'ACTIVE',
    issue: 'SHOT_VALUE',
    context: {
      competitionId,
      sessionId: '55555555-5555-4555-8555-555555555555',
      participantId: 'athlete-a',
      participantName: 'Athlete A',
      startNumber: '101',
      phase: 'MATCH',
      stageIndex: 1,
      seriesIndex: 2,
      seriesShotLimit: 5,
      recordedShots: 3,
      timedTargetProgramId: null,
      exposureIndex: null,
      lastShot: null,
    },
    message: 'Displayed value appears incorrect.',
    signalledAt: '2026-09-04T01:00:00.000Z',
    timing: {
      advisoryOnly: true,
      status: 'REQUIRES_OFFICIAL_REVIEW',
      elapsedMilliseconds: null,
      ruleReference: 'ISSF 6.16.5.2',
      guidance: 'Review the firing sequence and clock evidence.',
    },
    targetExaminationCaseId: null,
    linkedBy: null,
    linkedAt: null,
    ...overrides,
  };
}
