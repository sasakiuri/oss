// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteChampionship, loadChampionships } = vi.hoisted(() => ({
  deleteChampionship: vi.fn(),
  loadChampionships: vi.fn(),
}));

vi.mock('@/renderer/presentation/hooks/useChampionshipActions', () => ({
  useChampionshipActions: () => ({ loadChampionships, deleteChampionship }),
}));

import { ChampionshipList } from '@/renderer/presentation/features/championship/components/ChampionshipList';
import { useChampionshipStore } from '@/renderer/presentation/stores/domain/championship.store';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';

function notifications() {
  return useNotificationStore.getState().notifications.map(({ type, message }) => [type, message]);
}

async function requestDelete(confirmed: boolean) {
  render(<ChampionshipList onSelect={vi.fn()} onCreate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Spring Cup' }));
  await waitFor(() => expect(useConfirmDialogStore.getState().message).toBe('Delete this championship?'));
  if (confirmed) useConfirmDialogStore.getState().handleConfirm();
  else useConfirmDialogStore.getState().handleCancel();
}

describe('ChampionshipList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({ notifications: [] });
    useChampionshipStore.setState({
      championships: [{ id: CHAMPIONSHIP_ID, name: 'Spring Cup', date: '2026-03-01', venue: 'Main range' }],
    } as never);
  });

  it('deletes a championship after confirmation without a notification', async () => {
    deleteChampionship.mockResolvedValue({ success: true });
    await requestDelete(true);
    await waitFor(() => expect(deleteChampionship).toHaveBeenCalledExactlyOnceWith(CHAMPIONSHIP_ID));
    expect(notifications()).toEqual([]);
  });

  it('does not delete when the confirmation is cancelled', async () => {
    await requestDelete(false);
    await waitFor(() => expect(useConfirmDialogStore.getState().isOpen).toBe(false));
    expect(deleteChampionship).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a failed response',
      () => deleteChampionship.mockResolvedValue({ success: false, error: { message: 'In use' } }),
      'In use',
    ],
    [
      'a failed response without an error',
      () => deleteChampionship.mockResolvedValue({ success: false }),
      'Failed to delete the championship',
    ],
    ['a rejected error', () => deleteChampionship.mockRejectedValue(new Error('offline')), 'offline'],
    ['a rejected value', () => deleteChampionship.mockRejectedValue('offline'), 'Failed to delete the championship'],
  ])('reports %s while deleting', async (_case, arrange, message) => {
    arrange();
    await requestDelete(true);
    await waitFor(() => expect(notifications()).toEqual([['error', message]]));
  });
});
