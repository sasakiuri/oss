import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationalArchivesPanel } from '@/renderer/presentation/features/settings/OperationalArchivesPanel';
import { useNotificationStore } from '@/renderer/presentation/stores/ui/notifications.store';
import { operationalArchivesService } from '@/renderer/services';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);

const inspection = {
  path: '/backups/director.sqlite',
  fileName: 'director.sqlite',
  sizeBytes: 4096,
  sha256: 'a'.repeat(64),
  schemaVersion: 42,
  championshipCount: 1,
  integrityOk: true,
  inspectedAt: '2026-11-16T09:00:00.000Z',
};
const pending = {
  sourceFileName: 'director.sqlite',
  stagedSha256: 'b'.repeat(64),
  schemaVersion: 42,
  stagedAt: '2026-11-16T09:00:00.000Z',
  recoveryCopyWillBeCreated: true as const,
};

function notifications() {
  return useNotificationStore.getState().notifications.map(({ type, message }) => ({ type, message }));
}

describe('OperationalArchivesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({ notifications: [] });
  });

  it('notifies a failed pending-restore load with its message', async () => {
    vi.mocked(operationalArchivesService.getPendingRestore).mockResolvedValue(fail('Archive store is unavailable'));
    render(<OperationalArchivesPanel />);
    await waitFor(() => expect(notifications()).toEqual([{ type: 'error', message: 'Archive store is unavailable' }]));
  });

  it('notifies failed backup, inspection, staging and cancellation commands with their messages', async () => {
    vi.mocked(operationalArchivesService.getPendingRestore).mockResolvedValue(ok(null));
    vi.mocked(operationalArchivesService.createDatabaseBackup).mockResolvedValue(fail('Disk is full'));
    vi.mocked(operationalArchivesService.inspectRestoreCandidate)
      .mockResolvedValueOnce(fail('Backup file is not a Director database'))
      .mockResolvedValueOnce(
        ok({
          status: 'READY' as const,
          candidateToken: '00000000-0000-4000-8000-000000000001',
          inspection,
          compatible: true,
          compatibilityIssues: [],
        }),
      );
    vi.mocked(operationalArchivesService.scheduleRestore)
      .mockResolvedValueOnce(fail('Restore candidate expired', 'CONFLICT'))
      .mockResolvedValueOnce(ok(pending));
    vi.mocked(operationalArchivesService.cancelPendingRestore).mockResolvedValue(fail('Restore is already applied'));
    render(<OperationalArchivesPanel />);
    await waitFor(() => expect(operationalArchivesService.getPendingRestore).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Create verified backup' }));
    await waitFor(() => expect(notifications()).toEqual([{ type: 'error', message: 'Disk is full' }]));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create verified backup' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect restore candidate' }));
    await waitFor(() =>
      expect(notifications().at(-1)).toEqual({ type: 'error', message: 'Backup file is not a Director database' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Inspect restore candidate' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Inspect restore candidate' }));
    fireEvent.click(await screen.findByLabelText(/I understand that the selected backup/));
    fireEvent.click(screen.getByRole('button', { name: 'Stage restore' }));
    await waitFor(() =>
      expect(notifications().at(-1)).toEqual({ type: 'error', message: 'Restore candidate expired' }),
    );
    expect(screen.getByText('director.sqlite')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stage restore' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Stage restore' }));
    await waitFor(() =>
      expect(notifications().at(-1)).toEqual({
        type: 'success',
        message: 'Restore staged. Restart Director to apply it.',
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel pending restore' }));
    await waitFor(() =>
      expect(notifications().at(-1)).toEqual({ type: 'error', message: 'Restore is already applied' }),
    );
    expect(screen.getByText('Restore pending for the next Director restart')).toBeInTheDocument();
  });

  it('notifies the completed backup and the cancellation outcome', async () => {
    vi.mocked(operationalArchivesService.getPendingRestore).mockResolvedValue(ok(pending));
    vi.mocked(operationalArchivesService.createDatabaseBackup).mockResolvedValue(
      ok({ status: 'COMPLETED' as const, inspection }),
    );
    vi.mocked(operationalArchivesService.cancelPendingRestore).mockResolvedValue(ok({ cancelled: false }));
    render(<OperationalArchivesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel pending restore' }));
    await waitFor(() => expect(notifications()).toEqual([{ type: 'success', message: 'No restore was pending' }]));

    fireEvent.click(screen.getByRole('button', { name: 'Create verified backup' }));
    await waitFor(() =>
      expect(notifications().at(-1)).toEqual({
        type: 'success',
        message: 'Verified database backup created: director.sqlite',
      }),
    );
  });
});
