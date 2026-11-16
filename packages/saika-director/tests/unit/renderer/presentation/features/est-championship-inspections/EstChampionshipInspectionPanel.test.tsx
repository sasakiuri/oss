import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EstChampionshipInspectionPanel } from '@/renderer/presentation/features/est-championship-inspections/EstChampionshipInspectionPanel';
import { estChampionshipInspectionsService } from '@/renderer/services';
import type { EstChampionshipInspectionAssessmentDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

const entry = {
  id: 'entry',
  planId: 'plan',
  targetIdentifier: 'EST-1',
  outcome: 'PASSED' as const,
  statement: 'Function and accuracy verified',
  evidenceReference: null,
  performedBy: 'Operator',
  technicalDelegateName: 'Delegate',
  inspectedAt: '2026-09-09T08:00:00.000Z',
  recordedAt: '2026-09-09T08:00:00.000Z',
  revokedEntryId: null,
};

const planned: EstChampionshipInspectionAssessmentDto = {
  plan: {
    id: 'plan',
    championshipId: 'championship',
    versionNumber: 1,
    targetIdentifiers: ['EST-1'],
    methodStatement: 'Scoring function and accuracy checked',
    createdBy: 'Delegate',
    createdAt: '2026-09-09T07:00:00.000Z',
  },
  ready: true,
  ruleReference: 'ISSF 6.3.2.8',
  targets: [{ targetIdentifier: 'EST-1', status: 'PASSED', latestEntry: entry }],
  history: [entry],
};

describe('EstChampionshipInspectionPanel', () => {
  it('shows a failed load and a failed plan creation as their messages', async () => {
    vi.mocked(estChampionshipInspectionsService.get).mockResolvedValueOnce(fail('Championship not found'));
    const { unmount } = render(<EstChampionshipInspectionPanel championshipId="championship" />);
    expect(await screen.findByText('Championship not found')).toBeVisible();
    unmount();

    vi.mocked(estChampionshipInspectionsService.get).mockResolvedValue(
      ok({ plan: null, ready: false, ruleReference: 'ISSF 6.3.2.8', targets: [], history: [] }),
    );
    vi.mocked(estChampionshipInspectionsService.createPlan).mockResolvedValue(fail('The plan already changed'));
    render(<EstChampionshipInspectionPanel championshipId="championship" />);
    fireEvent.change(screen.getByLabelText(/Target identifiers/), { target: { value: 'EST-1' } });
    fireEvent.change(screen.getByLabelText('Plan author'), { target: { value: 'Delegate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(await screen.findByText('The plan already changed')).toBeVisible();
  });

  it('shows a failed recording and a failed revocation as their messages', async () => {
    vi.mocked(estChampionshipInspectionsService.get).mockResolvedValue(ok(planned));
    vi.mocked(estChampionshipInspectionsService.record).mockResolvedValue(fail('The target is not in the plan'));
    vi.mocked(estChampionshipInspectionsService.revoke).mockResolvedValue(fail('The entry was already revoked'));
    render(<EstChampionshipInspectionPanel championshipId="championship" />);
    await screen.findByText(/EST-1 · PASSED/);
    fireEvent.change(screen.getByLabelText('Test operator'), { target: { value: 'Operator' } });
    fireEvent.change(screen.getByLabelText('Supervising Technical Delegate'), { target: { value: 'Delegate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    expect(await screen.findByText('The target is not in the plan')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke latest' }));
    expect(await screen.findByText('The entry was already revoked')).toBeVisible();
    expect(screen.queryByText('The target is not in the plan')).toBeNull();
  });
});
