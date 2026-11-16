import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SquaddingPanel } from '@/renderer/presentation/features/championship/components/SquaddingPanel';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { squaddingService } from '@/renderer/services';
import type { SquaddingDrawDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../../helpers/renderer/mockServices')).mockServices(),
);

const pending: SquaddingDrawDto = {
  id: 'draw',
  eventId: 'event',
  competitionTypeId: 'AR60',
  seed: 'seed',
  algorithmVersion: '1',
  relayCount: 1,
  firstFiringPoint: 1,
  firingPointCount: 10,
  statusSectionPolicy: 'OFF',
  participantSnapshotHash: 'a'.repeat(64),
  outputHash: 'b'.repeat(64),
  assignments: [],
  findings: [],
  createdBy: 'Operator',
  createdAt: '2026-09-09T08:00:00.000Z',
  approval: null,
  application: null,
  voidEntry: null,
  stale: false,
};

function renderPanel(onApplied = vi.fn(async () => {})) {
  return render(
    <SquaddingPanel
      eventId="event"
      competitionTypeId="AR60"
      relayCount={1}
      firingPointCount={10}
      onApplied={onApplied}
    />,
  );
}

describe('SquaddingPanel', () => {
  it('shows failed loads and draws as their messages, the fallback text or the rejected value', async () => {
    vi.mocked(squaddingService.list).mockResolvedValueOnce(fail('Event not found'));
    const { unmount } = renderPanel();
    expect(await screen.findByText('Event not found')).toBeVisible();
    unmount();

    vi.mocked(squaddingService.list).mockResolvedValue(ok([]));
    vi.mocked(squaddingService.createDraw)
      .mockResolvedValueOnce(fail('Not enough firing points'))
      .mockResolvedValueOnce({ success: false } as Awaited<ReturnType<typeof squaddingService.createDraw>>)
      .mockRejectedValueOnce('Bridge closed');
    renderPanel();
    fireEvent.change(screen.getByLabelText('Official / operator'), { target: { value: 'Operator' } });
    const draw = screen.getByRole('button', { name: /^Draw 1 relay/ });
    fireEvent.click(draw);
    expect(await screen.findByText('Not enough firing points')).toBeVisible();
    fireEvent.click(draw);
    expect(await screen.findByText('Squadding operation failed')).toBeVisible();
    fireEvent.click(draw);
    expect(await screen.findByText('Bridge closed')).toBeVisible();
  });

  it('shows failed approvals and voids as their messages', async () => {
    vi.mocked(squaddingService.list).mockResolvedValue(ok([pending]));
    vi.mocked(squaddingService.approve).mockResolvedValueOnce(fail('Only the Technical Delegate can approve'));
    vi.mocked(squaddingService.voidDraw).mockResolvedValueOnce(fail('The draw was already applied'));
    renderPanel();
    await screen.findByText('approval pending');
    fireEvent.change(screen.getByLabelText('Official / operator'), { target: { value: 'Delegate' } });
    fireEvent.click(screen.getByRole('button', { name: 'TD approve' }));
    expect(await screen.findByText('Only the Technical Delegate can approve')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Void' }));
    expect(await screen.findByText('The draw was already applied')).toBeVisible();
  });

  it('shows a failed application as its message without reporting the draw as applied', async () => {
    const approval = { id: 'approval', officialName: 'Delegate', statement: 'Approved', recordedAt: pending.createdAt };
    vi.mocked(squaddingService.list).mockResolvedValue(ok([{ ...pending, approval }]));
    vi.mocked(squaddingService.apply).mockResolvedValueOnce(fail('Entries changed after the draw'));
    const onApplied = vi.fn(async () => {});
    renderPanel(onApplied);
    await screen.findByText('approved by Delegate');
    fireEvent.change(screen.getByLabelText('Official / operator'), { target: { value: 'Delegate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply approved draw' }));
    await waitFor(() => expect(useConfirmDialogStore.getState().isOpen).toBe(true));
    act(() => useConfirmDialogStore.getState().handleConfirm());
    expect(await screen.findByText('Entries changed after the draw')).toBeVisible();
    expect(onApplied).not.toHaveBeenCalled();
  });
});
