import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OutdoorEliminationPlanningPanel } from '@/renderer/presentation/features/elimination-planning/OutdoorEliminationPlanningPanel';
import { eliminationPlanningService } from '@/renderer/services';
import type { OutdoorEliminationPlanDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

const plan: OutdoorEliminationPlanDto = {
  id: 'plan',
  eventId: 'event',
  competitionTypeId: 'AR60',
  rulePackIdentity: { id: 'issf', schemaVersion: 1, fingerprint: { algorithm: 'SHA-256', value: 'a'.repeat(64) } },
  sourceHash: 'b'.repeat(64),
  entryCount: 120,
  usableFiringPoints: 50,
  relayStartCounts: [60, 60],
  status: 'PLANNED',
  eliminationRequired: true,
  minimumRelayCount: 3,
  qualificationPlaces: 60,
  relayQuotas: [],
  findings: [],
  waiver: null,
  createdBy: 'Delegate',
  createdAt: '2026-09-09T08:00:00.000Z',
  stale: false,
  approval: null,
  quotaAnnouncement: null,
  voidEntry: null,
};

describe('OutdoorEliminationPlanningPanel', () => {
  it('shows a failed assessment as its message or the rejected value', async () => {
    vi.mocked(eliminationPlanningService.list).mockResolvedValue(ok([]));
    vi.mocked(eliminationPlanningService.create)
      .mockResolvedValueOnce(fail('Firing-point assignments are incomplete'))
      .mockRejectedValueOnce('Bridge closed');
    render(<OutdoorEliminationPlanningPanel eventId="event" />);
    fireEvent.change(screen.getByLabelText('Usable firing points'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Plan author'), { target: { value: 'Delegate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create assessment' }));
    expect(await screen.findByText('Firing-point assignments are incomplete')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create assessment' }));
    expect(await screen.findByText('Bridge closed')).toBeVisible();
  });

  it('shows failed approvals, quota announcements and voids as their messages', async () => {
    vi.mocked(eliminationPlanningService.list).mockResolvedValueOnce(ok([plan]));
    vi.mocked(eliminationPlanningService.approve).mockResolvedValueOnce(fail('The source changed'));
    vi.mocked(eliminationPlanningService.voidPlan).mockResolvedValueOnce(fail('The plan is already void'));
    const { unmount } = render(<OutdoorEliminationPlanningPanel eventId="event" />);
    fireEvent.change(await screen.findByLabelText('Official / Technical Delegate'), { target: { value: 'TD' } });
    fireEvent.click(screen.getByRole('button', { name: 'TD approve' }));
    expect(await screen.findByText('The source changed')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    expect(await screen.findByText('The plan is already void')).toBeVisible();
    unmount();

    const approval = {
      id: 'approval',
      entryType: 'APPROVED' as const,
      officialName: 'TD',
      statement: 'Approved',
      recordedAt: '2026-09-09T09:00:00.000Z',
    };
    vi.mocked(eliminationPlanningService.list).mockResolvedValueOnce(ok([{ ...plan, approval }]));
    vi.mocked(eliminationPlanningService.announceQuotas).mockResolvedValueOnce(fail('Quotas were already announced'));
    render(<OutdoorEliminationPlanningPanel eventId="event" />);
    fireEvent.change(await screen.findByLabelText('Official / Technical Delegate'), { target: { value: 'TD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record quota announcement' }));
    expect(await screen.findByText('Quotas were already announced')).toBeVisible();
  });
});
