import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IncidentReportsView } from '@/renderer/presentation/features/championship/components/IncidentReportsView';
import type { IncidentReportEventStatusDto, RangeIncidentReportDto } from '@/shared/ipc/contracts';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '22222222-2222-4222-8222-222222222222';
const DECISION_ID = '33333333-3333-4333-8333-333333333333';
const RESULT_ID = '44444444-4444-4444-8444-444444444444';
const EVENT_TWO_ID = '66666666-6666-4666-8666-666666666666';

const { listByEvent, create, appendEntry, openIncidentReportPrint } = vi.hoisted(() => ({
  listByEvent: vi.fn(),
  create: vi.fn(),
  appendEntry: vi.fn(),
  openIncidentReportPrint: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  incidentReportsService: { listByEvent, create, appendEntry },
  boardService: { openIncidentReportPrint },
}));

function reportFixture(): RangeIncidentReportDto {
  return {
    id: REPORT_ID,
    eventId: EVENT_ID,
    serialNumber: 'IR-42',
    eventName: '10m Air Rifle',
    occurredAt: '2026-08-29T01:02:03.000Z',
    relayNumber: 1,
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    bibNumber: '42',
    nationality: 'JPN',
    stage: 'Qualification',
    series: '3',
    details: 'Target stopped responding.',
    ruleReferences: '6.14.6',
    penalty: 'Extra time granted',
    scoreAmendmentReference: null,
    initiatorRole: 'RANGE_OFFICER',
    initiatorName: 'Range Officer A',
    createdAt: '2026-08-29T01:05:00.000Z',
    entries: [],
    linkedDecisions: [],
    missingSignatureRoles: ['COMPETITION_JURY_MEMBER', 'RTS_OFFICER', 'RTS_JURY_MEMBER', 'RANKING_TECHNICAL_OFFICER'],
    forwarded: false,
    voided: false,
  };
}

function statusFixture(reports: RangeIncidentReportDto[] = [reportFixture()]): IncidentReportEventStatusDto {
  return {
    eventId: EVENT_ID,
    reports,
    requiredDecisionCount: 1,
    coveredDecisionCount: 0,
    uncoveredDecisions: [
      {
        id: DECISION_ID,
        participantId: 'participant-1',
        relayNumber: 1,
        resultScope: 'QUALIFICATION',
        resultId: RESULT_ID,
        type: 'EXTRA_TIME',
        ruleReference: '6.11.3.2',
        publicRemark: 'Five minutes extra time',
        officialName: 'Jury A',
        decidedAt: '2026-08-29T01:03:00.000Z',
        active: true,
        incidentReportNumber: null,
        coverageIssue: 'MISSING_REFERENCE',
      },
    ],
  };
}

describe('IncidentReportsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByEvent.mockResolvedValue({ success: true, data: statusFixture() });
    create.mockResolvedValue({ success: true, data: reportFixture() });
    appendEntry.mockResolvedValue({
      success: true,
      data: {
        id: '55555555-5555-4555-8555-555555555555',
        reportId: REPORT_ID,
        type: 'FORWARDED',
        officialRole: null,
        destination: 'RTS Office',
        statement: 'Copy forwarded',
        officialName: 'Range Officer A',
        recordedAt: '2026-08-29T01:06:00.000Z',
      },
    });
    openIncidentReportPrint.mockResolvedValue({ success: true, data: 'window-1' });
  });

  it('shows decision coverage, report facts, append actions, and print routing', async () => {
    render(
      <IncidentReportsView
        eventId={EVENT_ID}
        eventName="10m Air Rifle"
        participants={[
          {
            id: 'participant-1',
            playerName: 'Alex Athlete',
            affiliation: 'JPN',
            logoPath: null,
            sortOrder: 0,
          },
        ]}
      />,
    );

    expect(await screen.findByText('Five minutes extra time · Rule 6.11.3.2')).toBeInTheDocument();
    expect(screen.getByText('IR number missing')).toBeInTheDocument();
    expect(screen.getByText('Target stopped responding.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Print operational copy' }));
    await waitFor(() => expect(openIncidentReportPrint).toHaveBeenCalledWith({ reportId: REPORT_ID }));

    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'FORWARDED' } });
    fireEvent.change(screen.getByLabelText('Official printed name'), { target: { value: 'Range Officer A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append entry' }));

    await waitFor(() =>
      expect(appendEntry).toHaveBeenCalledWith({
        reportId: REPORT_ID,
        type: 'FORWARDED',
        destination: 'RTS Office / Scoring and Results Office',
        officialName: 'Range Officer A',
      }),
    );
  });

  it('creates a report from the event-level workspace without requiring an athlete', async () => {
    listByEvent.mockResolvedValueOnce({ success: true, data: statusFixture([]) });
    render(<IncidentReportsView eventId={EVENT_ID} eventName="10m Air Rifle" participants={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'New incident report' }));
    fireEvent.change(screen.getByLabelText('IR serial number'), { target: { value: 'IR-43' } });
    fireEvent.change(screen.getByLabelText('Brief details of incident'), {
      target: { value: 'Range-wide target interruption.' },
    });
    fireEvent.change(screen.getByLabelText('Initiating official printed name'), {
      target: { value: 'Range Officer B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create immutable report' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: EVENT_ID,
          serialNumber: 'IR-43',
          details: 'Range-wide target interruption.',
          ruleReferences: '6.14.6',
          initiatorRole: 'RANGE_OFFICER',
          initiatorName: 'Range Officer B',
          occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      ),
    );
  });

  it('does not display an old event response after the selected event changes', async () => {
    let resolveFirst!: (value: { success: true; data: IncidentReportEventStatusDto }) => void;
    const firstRequest = new Promise<{ success: true; data: IncidentReportEventStatusDto }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondReport = {
      ...reportFixture(),
      id: '77777777-7777-4777-8777-777777777777',
      eventId: EVENT_TWO_ID,
      serialNumber: 'IR-99',
      eventName: '10m Air Pistol',
    };
    listByEvent
      .mockReset()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce({
        success: true,
        data: {
          ...statusFixture([secondReport]),
          eventId: EVENT_TWO_ID,
          requiredDecisionCount: 0,
          coveredDecisionCount: 0,
          uncoveredDecisions: [],
        },
      });
    const { rerender } = render(<IncidentReportsView eventId={EVENT_ID} eventName="10m Air Rifle" participants={[]} />);

    rerender(<IncidentReportsView eventId={EVENT_TWO_ID} eventName="10m Air Pistol" participants={[]} />);
    expect((await screen.findAllByText('IR IR-99')).length).toBeGreaterThan(0);

    await act(async () => resolveFirst({ success: true, data: statusFixture() }));

    await waitFor(() => expect(screen.queryAllByText('IR IR-42')).toHaveLength(0));
    expect(screen.getAllByText('IR IR-99').length).toBeGreaterThan(0);
  });
});
