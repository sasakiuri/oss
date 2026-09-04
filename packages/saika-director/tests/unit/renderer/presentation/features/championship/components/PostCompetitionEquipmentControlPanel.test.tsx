import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PostCompetitionEquipmentControlPanel } from '@/renderer/presentation/features/championship/components/PostCompetitionEquipmentControlPanel';
import type { PostCompetitionEquipmentCheckDto } from '@/shared/ipc/contracts';

const { list, select, issueNotice, recordTest, confirmFailure, voidCheck } = vi.hoisted(() => ({
  list: vi.fn(),
  select: vi.fn(),
  issueNotice: vi.fn(),
  recordTest: vi.fn(),
  confirmFailure: vi.fn(),
  voidCheck: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  postCompetitionEquipmentControlService: { list, select, issueNotice, recordTest, confirmFailure, voidCheck },
}));

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';
const CHECK_ID = '44444444-4444-4444-8444-444444444444';
const TEST_ENTRY_ID = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-09-07T01:02:03.000Z';

function checkFixture(overrides: Partial<PostCompetitionEquipmentCheckDto> = {}): PostCompetitionEquipmentCheckDto {
  return {
    id: CHECK_ID,
    championshipId: CHAMPIONSHIP_ID,
    eventId: EVENT_ID,
    eventName: '10m Air Pistol Women',
    eventType: 'AP60W',
    round: 'Qualification',
    participantId: PARTICIPANT_ID,
    athleteName: 'Alex Athlete',
    startNumber: '42',
    gender: 'F',
    selectionBasis: 'RANDOM_DRAW',
    selectionStatement: 'Draw witnessed by the Equipment Control Jury',
    selectedBy: 'Jury A',
    selectedAt: NOW,
    recordedAt: NOW,
    ruleReferences: ['ISSF 6.7.9.1'],
    status: 'SELECTED',
    separateDisqualificationActionRequired: false,
    sanctionAuthorityReference: `EQUIPMENT-CONTROL:${CHECK_ID}`,
    entries: [],
    ...overrides,
  };
}

describe('PostCompetitionEquipmentControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ success: true, data: [] });
  });

  it('records an explicit athlete selection and its ISSF basis', async () => {
    const selected = checkFixture();
    select.mockResolvedValue({ success: true, data: [selected] });
    render(
      <PostCompetitionEquipmentControlPanel
        championshipId={CHAMPIONSHIP_ID}
        eventId={EVENT_ID}
        participants={[
          {
            id: PARTICIPANT_ID,
            playerName: 'Alex Athlete',
            affiliation: 'JPN',
            logoPath: null,
            sortOrder: 0,
            startNumber: '42',
            gender: 'F',
          },
        ]}
      />,
    );

    await waitFor(() => expect(list).toHaveBeenCalledWith({ championshipId: CHAMPIONSHIP_ID }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Alex Athlete/ }));
    fireEvent.change(screen.getByLabelText('Selecting official'), { target: { value: 'Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record selection (1)' }));

    await waitFor(() =>
      expect(select).toHaveBeenCalledWith({
        championshipId: CHAMPIONSHIP_ID,
        eventId: EVENT_ID,
        participantIds: [PARTICIPANT_ID],
        selectionBasis: 'RANDOM_DRAW',
        selectionStatement: 'Selection completed under Equipment Control Jury supervision',
        selectedBy: 'Jury A',
        selectedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
    expect(await screen.findByText(/Alex Athlete · Start 42/)).toBeInTheDocument();
  });

  it('requires calibrated-equipment evidence before confirming a failed test', async () => {
    const pending = checkFixture({
      status: 'FAILED_PENDING_CONFIRMATION',
      entries: [
        {
          id: TEST_ENTRY_ID,
          checkId: CHECK_ID,
          type: 'TEST_RECORDED',
          outcome: 'FAILED',
          testedItems: ['Trigger pull'],
          clothingOrTapingCheck: false,
          sameGenderJudgeAvailable: null,
          attempts: 3,
          performedBy: 'Officer A',
          equipmentControlJurySupervisor: 'Jury B',
          statement: 'Trigger did not pass after three attempts',
          occurredAt: NOW,
          recordedAt: NOW,
        },
      ],
    });
    const confirmed = checkFixture({
      ...pending,
      status: 'FAILED_CONFIRMED',
      separateDisqualificationActionRequired: true,
    });
    list.mockResolvedValue({ success: true, data: [pending] });
    confirmFailure.mockResolvedValue({ success: true, data: confirmed });
    render(
      <PostCompetitionEquipmentControlPanel championshipId={CHAMPIONSHIP_ID} eventId={EVENT_ID} participants={[]} />,
    );

    expect(await screen.findByText('FAILED PENDING CONFIRMATION')).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', { name: 'Confirm test and procedure' });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Calibration reference'), { target: { value: 'CAL-2026-09-07' } });
    fireEvent.change(screen.getByLabelText('Confirming Jury member'), { target: { value: 'Jury Chair' } });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(confirmFailure).toHaveBeenCalledWith({
        checkId: CHECK_ID,
        calibrationReference: 'CAL-2026-09-07',
        confirmedBy: 'Jury Chair',
        confirmerRole: 'EQUIPMENT_CONTROL_JURY_CHAIR',
        statement: 'Test procedure and result reviewed and confirmed',
        confirmedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
  });

  it('exposes a confirmed failure as evidence for a separate sanction action', async () => {
    list.mockResolvedValue({
      success: true,
      data: [
        checkFixture({
          status: 'FAILED_CONFIRMED',
          separateDisqualificationActionRequired: true,
        }),
      ],
    });
    render(
      <PostCompetitionEquipmentControlPanel championshipId={CHAMPIONSHIP_ID} eventId={EVENT_ID} participants={[]} />,
    );

    expect(await screen.findByText('Separate disqualification action required')).toBeInTheDocument();
    expect(screen.getByText(`EQUIPMENT-CONTROL:${CHECK_ID}`)).toBeInTheDocument();
    expect(recordTest).not.toHaveBeenCalled();
  });
});
