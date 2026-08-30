import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TargetExaminationsPanel } from '@/renderer/presentation/features/target-examinations';
import type { TargetExaminationCaseDto } from '@/shared/ipc/contracts';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const CASE_ID = '33333333-3333-4333-8333-333333333333';
const LANE_ID = '44444444-4444-4444-8444-444444444444';

const { listAll, listByScope, create, linkScope, addEvidence, appendEntry } = vi.hoisted(() => ({
  listAll: vi.fn(),
  listByScope: vi.fn(),
  create: vi.fn(),
  linkScope: vi.fn(),
  addEvidence: vi.fn(),
  appendEntry: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  targetExaminationsService: { listAll, listByScope, create, linkScope, addEvidence, appendEntry },
}));

function caseFixture(overrides: Partial<TargetExaminationCaseDto> = {}): TargetExaminationCaseDto {
  return {
    id: CASE_ID,
    issueKind: 'NO_SHOT_INDICATION',
    occurredAt: '2026-08-31T01:00:00.000Z',
    laneId: LANE_ID,
    firingPointNumber: 12,
    relayNumber: 1,
    athleteName: 'Alex Athlete',
    shotId: null,
    summary: 'Expected shot was not shown',
    details: 'The monitor remained unchanged after the athlete reported firing.',
    ruleReferences: 'ISSF 6.10.5, 6.10.8',
    openedBy: 'RTS Officer A',
    createdAt: '2026-08-31T01:00:01.000Z',
    scopes: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        caseId: CASE_ID,
        scopeType: 'COMPETITION',
        scopeId: COMPETITION_ID,
        linkedBy: 'RTS Officer A',
        note: 'Linked when opened',
        linkedAt: '2026-08-31T01:00:01.000Z',
      },
    ],
    evidence: [],
    entries: [],
    status: 'OPEN',
    evidenceHoldActive: true,
    workflow: {
      policyId: 'ISSF-2026-TARGET-EXAMINATION-V1',
      advisoryOnly: true,
      readyForJuryDecision: false,
      steps: [
        {
          id: 'est-log-print',
          label: 'Secure the EST LOG print',
          ruleReference: 'ISSF 6.10.8.1.g',
          status: 'MISSING',
          guidance: 'Do not clear the LOG until the RTS Jury authorizes release of the evidence hold.',
        },
      ],
    },
    ...overrides,
  };
}

describe('TargetExaminationsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByScope.mockResolvedValue({ success: true, data: [caseFixture()] });
    listAll.mockResolvedValue({ success: true, data: [caseFixture()] });
    create.mockResolvedValue({ success: true, data: caseFixture() });
    linkScope.mockResolvedValue({ success: true, data: caseFixture() });
    addEvidence.mockResolvedValue({ success: true, data: caseFixture() });
    appendEntry.mockResolvedValue({
      success: true,
      data: caseFixture({ evidenceHoldActive: false }),
    });
  });

  it('shows an active hold and records explicit release authorization', async () => {
    render(
      <TargetExaminationsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        additionalScopes={[{ scopeType: 'EVENT', scopeId: EVENT_ID }]}
      />,
    );

    expect((await screen.findAllByText('Expected shot was not shown')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Hold active').length).toBeGreaterThan(0);
    expect(screen.getByText(/decisions do not alter scores/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record action' }));
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'HOLD_RELEASED' } });
    fireEvent.change(screen.getByLabelText('Statement / authorization'), {
      target: { value: 'RTS Jury authorized CLEAR LOG after all evidence was secured.' },
    });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'RTS Jury A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append action' }));

    await waitFor(() =>
      expect(appendEntry).toHaveBeenCalledWith({
        caseId: CASE_ID,
        type: 'HOLD_RELEASED',
        statement: 'RTS Jury authorized CLEAR LOG after all evidence was secured.',
        officialName: 'RTS Jury A',
        ruleReference: 'ISSF 6.10.8.3',
      }),
    );
  });

  it('opens a Lane case with independent competition and event scope links', async () => {
    listByScope.mockResolvedValueOnce({ success: true, data: [] });
    render(
      <TargetExaminationsPanel
        primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }}
        additionalScopes={[{ scopeType: 'EVENT', scopeId: EVENT_ID }]}
        defaultLaneId={LANE_ID}
        lanes={[{ laneId: LANE_ID, label: 'Firing point 12 · Lane 12', firingPointNumber: 12 }]}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open case' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'No shot on monitor' } });
    fireEvent.change(screen.getByLabelText('Observed facts'), { target: { value: 'Athlete reported one shot.' } });
    fireEvent.change(screen.getByLabelText('Opened by'), { target: { value: 'RTS Officer B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open case and hold data' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: [
            { scopeType: 'COMPETITION', scopeId: COMPETITION_ID },
            { scopeType: 'EVENT', scopeId: EVENT_ID },
          ],
          issueKind: 'NO_SHOT_INDICATION',
          laneId: LANE_ID,
          firingPointNumber: 12,
          summary: 'No shot on monitor',
          details: 'Athlete reported one shot.',
          ruleReferences: 'ISSF 6.10.8, 6.10.9.3',
          openedBy: 'RTS Officer B',
        }),
      ),
    );
  });

  it('keeps completed competition cases accessible from the global archive', async () => {
    render(<TargetExaminationsPanel />);

    expect((await screen.findAllByText('Expected shot was not shown')).length).toBeGreaterThan(0);
    expect(listAll).toHaveBeenCalledOnce();
    expect(listByScope).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Open case' })).not.toBeInTheDocument();
  });
});
