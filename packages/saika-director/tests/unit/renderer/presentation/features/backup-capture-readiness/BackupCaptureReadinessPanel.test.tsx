import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BackupCaptureReadinessPanel } from '@/renderer/presentation/features/backup-capture-readiness/BackupCaptureReadinessPanel';
import { backupCaptureReadinessService } from '@/renderer/services';
import type { BackupCaptureReadinessDto } from '@/shared/ipc/contracts/backupCaptureReadiness.contract';

vi.mock('@/renderer/services', () => ({
  backupCaptureReadinessService: { get: vi.fn(), save: vi.fn(), sources: vi.fn() },
}));
let data: BackupCaptureReadinessDto;
beforeEach(() => {
  vi.clearAllMocks();
  data = {
    settings: { competitionId: 'competition', eventId: null, mode: 'DISABLED', maximumAgeMilliseconds: 15_000 },
    revision: 'first',
    health: { state: 'DISABLED', issues: [] },
  };
  vi.mocked(backupCaptureReadinessService.get).mockImplementation(async () => ({ success: true, data }));
  vi.mocked(backupCaptureReadinessService.sources).mockResolvedValue({
    success: true,
    data: [{ eventId: 'event', label: 'Air Rifle · backup.csv' }],
  });
});
describe('backup capture readiness controls', () => {
  it('saves the selected event, independent enforcement mode and freshness interval', async () => {
    vi.mocked(backupCaptureReadinessService.save).mockImplementation(async (input) => {
      data = { settings: input, revision: 'second', health: { state: 'STOPPED', issues: ['Start backup capture'] } };
      return { success: true, data };
    });
    render(<BackupCaptureReadinessPanel competitionId="competition" />);
    fireEvent.change(await screen.findByLabelText('Backup check mode'), { target: { value: 'REQUIRED' } });
    fireEvent.change(screen.getByLabelText('Independent backup source'), { target: { value: 'event' } });
    fireEvent.change(screen.getByLabelText('Maximum backup check age (seconds)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save backup checks' }));
    await waitFor(() =>
      expect(backupCaptureReadinessService.save).toHaveBeenCalledWith({
        competitionId: 'competition',
        eventId: 'event',
        mode: 'REQUIRED',
        maximumAgeMilliseconds: 30_000,
        expectedRevision: 'first',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Start backup capture');
  });
  it('shows stale-source warnings and allows reloading settings after a rejected edit', async () => {
    data = {
      ...data,
      settings: { ...data.settings, mode: 'ADVISORY', eventId: 'event' },
      health: { state: 'STALE', issues: ['Snapshot is too old'] },
    };
    vi.mocked(backupCaptureReadinessService.save).mockRejectedValue(new Error('Settings changed'));
    render(<BackupCaptureReadinessPanel competitionId="competition" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Snapshot is too old');
    fireEvent.change(screen.getByLabelText('Backup check mode'), { target: { value: 'REQUIRED' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save backup checks' }));
    await screen.findByText('Settings changed');
    fireEvent.click(screen.getByRole('button', { name: 'Reload saved settings' }));
    expect(screen.getByLabelText('Backup check mode')).toHaveValue('ADVISORY');
  });
});
