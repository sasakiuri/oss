import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EstBackupCapturePanel } from '@/renderer/presentation/features/championship/components/EstBackupCapturePanel';
import { estBackupVerificationService } from '@/renderer/services';
import type { EstBackupCaptureStatusDto } from '@/shared/ipc/contracts/estBackupVerification.contract';

vi.mock('@/renderer/services', () => ({
  estBackupVerificationService: {
    getCapture: vi.fn(),
    startCapture: vi.fn(),
    stopCapture: vi.fn(),
    checkCapture: vi.fn(),
    resumeCapture: vi.fn(),
    forgetCapture: vi.fn(),
  },
}));
let state: EstBackupCaptureStatusDto;
beforeEach(() => {
  vi.clearAllMocks();
  state = {
    eventId: 'event',
    runId: null,
    state: 'STOPPED',
    sourceLabel: null,
    intervalMilliseconds: null,
    snapshotMode: null,
    resumeOnStartup: false,
    canResume: false,
    checkedAt: null,
    capturedAt: null,
    retainedSourceCheckedAt: null,
    sourceId: null,
    error: null,
  };
  vi.mocked(estBackupVerificationService.getCapture).mockImplementation(async () => ({ success: true, data: state }));
});
describe('backup capture controls', () => {
  it('uses the selected mapping, refreshes retained sources and stops only the displayed run', async () => {
    const mapping = {
      delimiter: ';' as const,
      decimalSeparator: ',' as const,
      keyColumn: 'Bib',
      totalScoreColumn: 'Score',
      rankColumn: null,
    };
    vi.mocked(estBackupVerificationService.startCapture).mockImplementation(async () => {
      state = { ...state, state: 'WAITING', runId: 'run', sourceLabel: 'feed.csv', intervalMilliseconds: 2000 };
      return { success: true, data: state };
    });
    vi.mocked(estBackupVerificationService.checkCapture).mockImplementation(async () => {
      state = { ...state, state: 'READY', sourceId: 'source', capturedAt: '2026-09-09T00:00:00Z' };
      return { success: true, data: state };
    });
    vi.mocked(estBackupVerificationService.stopCapture).mockImplementation(async () => {
      state = { ...state, state: 'STOPPED' };
      return { success: true, data: state };
    });
    const onCaptured = vi.fn();
    render(<EstBackupCapturePanel eventId="event" mapping={mapping} onCaptured={onCaptured} />);
    await screen.findByText(/STOPPED/);
    fireEvent.change(screen.getByLabelText('Check interval (seconds)'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose source and start capture' }));
    await screen.findByRole('button', { name: 'Stop capture' });
    expect(estBackupVerificationService.startCapture).toHaveBeenCalledWith({
      eventId: 'event',
      intervalMilliseconds: 2000,
      snapshotMode: 'STABLE_READS',
      resumeOnStartup: false,
      mapping,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check source now' }));
    await waitFor(() => expect(onCaptured).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Stop capture' }));
    await screen.findByText(/STOPPED/);
    expect(estBackupVerificationService.stopCapture).toHaveBeenCalledWith({ eventId: 'event', runId: 'run' });
  });
  it('shows capture failures without hiding the last retained snapshot time', async () => {
    state = {
      ...state,
      state: 'ERROR',
      runId: 'run',
      sourceLabel: 'feed.csv',
      sourceId: 'source',
      capturedAt: '2026-09-09T00:00:00Z',
      error: 'Source offline',
    };
    render(<EstBackupCapturePanel eventId="event" onCaptured={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Source offline');
    expect(screen.getByRole('status')).toHaveTextContent('Last retained:');
    expect(screen.getByRole('button', { name: 'Stop capture' })).toBeEnabled();
  });

  it('passes the explicit complete-files choice to a new capture', async () => {
    vi.mocked(estBackupVerificationService.startCapture).mockResolvedValue({ success: true, data: state });
    render(<EstBackupCapturePanel eventId="event" onCaptured={vi.fn()} />);
    await screen.findByText(/STOPPED/);
    fireEvent.change(screen.getByLabelText('Snapshot mode'), { target: { value: 'COMPLETE_FILES' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose source and start capture' }));
    await waitFor(() =>
      expect(estBackupVerificationService.startCapture).toHaveBeenCalledWith({
        eventId: 'event',
        intervalMilliseconds: 5000,
        snapshotMode: 'COMPLETE_FILES',
        resumeOnStartup: false,
      }),
    );
  });

  it('resumes saved settings without requiring a new file selection', async () => {
    state = { ...state, canResume: true, sourceLabel: 'saved.csv' };
    vi.mocked(estBackupVerificationService.resumeCapture).mockResolvedValue({
      success: true,
      data: { ...state, runId: 'resumed', state: 'WAITING' },
    });
    render(<EstBackupCapturePanel eventId="event" onCaptured={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume saved source' }));
    await waitFor(() => expect(estBackupVerificationService.resumeCapture).toHaveBeenCalledWith({ eventId: 'event' }));
    expect(estBackupVerificationService.startCapture).not.toHaveBeenCalled();
  });

  it('opts in to automatic restart only when the operator selects it', async () => {
    vi.mocked(estBackupVerificationService.startCapture).mockResolvedValue({ success: true, data: state });
    render(<EstBackupCapturePanel eventId="event" onCaptured={vi.fn()} />);
    await screen.findByText(/STOPPED/);
    fireEvent.click(screen.getByLabelText('Resume automatically after restarting Director'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose source and start capture' }));
    await waitFor(() =>
      expect(estBackupVerificationService.startCapture).toHaveBeenCalledWith(
        expect.objectContaining({ resumeOnStartup: true }),
      ),
    );
  });
});
