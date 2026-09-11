import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TargetExaminationsPanel } from '@/renderer/presentation/features/target-examinations';
import type { TargetExaminationCaseDto } from '@/shared/ipc/contracts';

import { CASE_ID, COMPETITION_ID, EVENT_ID, LANE_ID, caseFixture, deferred } from './fixtures';

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
    expect(screen.getByText(/recording a decision does not change scores/i)).toBeInTheDocument();

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
  it.each(['action', 'evidence'] as const)('does not carry an %s draft to another case', async (kind) => {
    const second = caseFixture({ id: '66666666-6666-4666-8666-666666666666', summary: 'Second case' });
    listByScope.mockResolvedValue({ success: true, data: [second, caseFixture()] });
    render(<TargetExaminationsPanel primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }} />);
    await screen.findByRole('heading', { name: 'Expected shot was not shown' });
    const button = kind === 'action' ? 'Record action' : 'Add evidence';
    const field = kind === 'action' ? 'Statement / authorization' : 'Description';
    fireEvent.click(screen.getByRole('button', { name: button }));
    fireEvent.change(screen.getByLabelText(field), { target: { value: 'Facts for the first case only' } });

    fireEvent.click(screen.getByRole('button', { name: /Second case/ }));

    expect(screen.queryByLabelText(field)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: button }));
    expect(screen.getByLabelText(field)).toHaveValue('');
  });

  it('keeps the newly created case when the initial list completes late', async () => {
    const initial = deferred<{ success: true; data: TargetExaminationCaseDto[] }>();
    listByScope.mockReturnValueOnce(initial.promise);
    render(<TargetExaminationsPanel primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open case' }));
    fireEvent.change(screen.getByLabelText('Summary'), { target: { value: 'New examination' } });
    fireEvent.change(screen.getByLabelText('Observed facts'), { target: { value: 'Monitor did not update.' } });
    fireEvent.change(screen.getByLabelText('Opened by'), { target: { value: 'RTS Officer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open case and hold data' }));
    await screen.findByRole('heading', { name: 'Expected shot was not shown' });

    await act(async () => initial.resolve({ success: true, data: [] }));

    expect(screen.getByRole('heading', { name: 'Expected shot was not shown' })).toBeInTheDocument();
  });
  it('keeps the newly selected case after an action for the previous case completes', async () => {
    const second = caseFixture({ id: '66666666-6666-4666-8666-666666666666', summary: 'Second case' });
    listByScope.mockResolvedValue({ success: true, data: [second, caseFixture()] });
    const pending = deferred<{ success: true; data: TargetExaminationCaseDto }>();
    appendEntry.mockReturnValueOnce(pending.promise);
    render(<TargetExaminationsPanel primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }} />);
    await screen.findByRole('heading', { name: 'Expected shot was not shown' });
    fireEvent.click(screen.getByRole('button', { name: 'Record action' }));
    fireEvent.change(screen.getByLabelText('Statement / authorization'), { target: { value: 'First case note' } });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'RTS Officer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append action' }));
    fireEvent.click(screen.getByRole('button', { name: /Second case/ }));

    await act(async () => pending.resolve({ success: true, data: caseFixture() }));

    expect(appendEntry).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: CASE_ID, statement: 'First case note' }),
    );
    expect(screen.getByRole('heading', { name: 'Second case' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record action' }));
    expect(screen.getByLabelText('Statement / authorization')).toHaveValue('');
  });

  it('retains an action draft when its command fails so the official can retry', async () => {
    appendEntry.mockResolvedValueOnce({ success: false, error: { message: 'Unable to append action' } });
    render(<TargetExaminationsPanel primaryScope={{ scopeType: 'COMPETITION', scopeId: COMPETITION_ID }} />);
    await screen.findByRole('heading', { name: 'Expected shot was not shown' });
    fireEvent.click(screen.getByRole('button', { name: 'Record action' }));
    fireEvent.change(screen.getByLabelText('Statement / authorization'), { target: { value: 'Retain this note' } });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'RTS Officer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append action' }));

    await screen.findByText('Unable to append action');

    expect(screen.getByLabelText('Statement / authorization')).toHaveValue('Retain this note');
    expect(screen.getByRole('button', { name: 'Append action' })).toBeEnabled();
  });
});
