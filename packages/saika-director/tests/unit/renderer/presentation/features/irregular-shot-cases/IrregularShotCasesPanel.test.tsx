import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IrregularShotCasesPanel } from '@/renderer/presentation/features/irregular-shot-cases/IrregularShotCasesPanel';
import { incidentReportsService, irregularShotCasesService, scoringDecisionsService } from '@/renderer/services';
import type { IrregularShotCaseDto } from '@/shared/ipc/contracts';
import { ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { list, appendEntry } = vi.mocked(irregularShotCasesService);

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITION_ID = '22222222-2222-4222-8222-222222222222';
const LANE_ID = '33333333-3333-4333-8333-333333333333';
const SUMMARY = 'Two shots registered on FP 1 at the same time';

function irregularCase(status: IrregularShotCaseDto['status']): IrregularShotCaseDto {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    eventId: EVENT_ID,
    competitionId: COMPETITION_ID,
    resultScope: 'QUALIFICATION',
    kind: 'CROSS_FIRE',
    subjectLaneId: LANE_ID,
    adjacentLaneIds: [],
    windowStartAt: '2026-11-16T01:00:00.000Z',
    windowEndAt: '2026-11-16T01:00:30.000Z',
    summary: SUMMARY,
    ruleReference: 'ISSF 6.11.6',
    openedBy: 'Jury Member',
    occurredAt: '2026-11-16T01:00:10.000Z',
    createdAt: '2026-11-16T01:01:00.000Z',
    status,
    publicationBlocked: true,
    timeline: [],
    evidence: [],
    entries: [],
  };
}

function renderPanel() {
  render(
    <IrregularShotCasesPanel
      eventId={EVENT_ID}
      competitionId={COMPETITION_ID}
      resultScope="QUALIFICATION"
      lanes={[{ laneId: LANE_ID, label: 'FP 1' }]}
    />,
  );
}

async function caseCard(): Promise<HTMLElement> {
  const card = (await screen.findByText(SUMMARY)).closest('section');
  if (!card) throw new Error('Case card not found');
  return card;
}

function fillOfficialAndStatement(card: HTMLElement, statement: string) {
  fireEvent.change(within(card).getByLabelText('Official name'), { target: { value: 'Jury Member' } });
  fireEvent.change(within(card).getByLabelText('Statement'), { target: { value: statement } });
}

describe('IrregularShotCasesPanel case actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(incidentReportsService.listByEvent).mockResolvedValue(
      ok({ eventId: EVENT_ID, reports: [], requiredDecisionCount: 0, coveredDecisionCount: 0, uncoveredDecisions: [] }),
    );
    vi.mocked(scoringDecisionsService.listByEvent).mockResolvedValue(ok({ decisions: [] }));
  });

  it('submits an action the new case status allows after a status change', async () => {
    list.mockResolvedValue(ok([irregularCase('OPEN')]));
    appendEntry.mockResolvedValueOnce(ok(irregularCase('REFERRED')));
    appendEntry.mockResolvedValueOnce(ok(irregularCase('REFERRED')));
    renderPanel();
    const card = await caseCard();

    fireEvent.change(within(card).getByLabelText('Case action'), { target: { value: 'REFERRED' } });
    fillOfficialAndStatement(card, 'Referred to the Jury');
    fireEvent.click(within(card).getByRole('button', { name: 'Append case action' }));
    await within(card).findByText(/^REFERRED/);

    expect(within(card).getByLabelText('Case action')).toHaveValue('NOTE');
    fireEvent.change(within(card).getByLabelText('Statement'), { target: { value: 'Jury is reviewing the video' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Append case action' }));

    await waitFor(() => expect(appendEntry).toHaveBeenCalledTimes(2));
    expect(appendEntry.mock.calls[1]?.[0]).toMatchObject({ type: 'NOTE', statement: 'Jury is reviewing the video' });
  });
});
