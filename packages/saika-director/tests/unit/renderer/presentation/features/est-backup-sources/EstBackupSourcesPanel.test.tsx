import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EstBackupSourcesPanel } from '@/renderer/presentation/features/est-backup-sources/EstBackupSourcesPanel';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const { listSources, getSource, print } = vi.hoisted(() => ({
  listSources: vi.fn(),
  getSource: vi.fn(),
  print: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  estBackupVerificationService: { listSources, getSource },
  boardService: { openEstBackupSourcePrint: print },
}));
describe('retained source selection', () => {
  it('opens source printing independently and reuses only a source belonging to the selected event', async () => {
    const source = {
      id: 'source',
      eventId: 'event',
      fileName: 'memory.csv',
      recordCount: 1,
      importedAt: '2026-09-09T00:00:00Z',
    };
    listSources.mockResolvedValue({ success: true, data: [source] });
    getSource.mockResolvedValue({ success: true, data: { ...source, eventId: 'other' } });
    print.mockResolvedValue({ success: true, data: 'window' });
    const selected = vi.fn();
    render(<EstBackupSourcesPanel eventId="event" generation={0} onSelected={selected} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print source' }));
    await waitFor(() => expect(print).toHaveBeenCalledWith({ sourceId: 'source' }));
    expect(getSource).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use source records' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('another event');
    expect(selected).not.toHaveBeenCalled();
    getSource.mockResolvedValue({ success: true, data: source });
    fireEvent.click(screen.getByRole('button', { name: 'Use source records' }));
    await waitFor(() => expect(selected).toHaveBeenCalledWith(source));
  });

  it('shows a failed list and a failed source read as error text, and a failed print as its message', async () => {
    const source = {
      id: 'source',
      eventId: 'event',
      fileName: 'memory.csv',
      recordCount: 1,
      importedAt: '2026-09-09T00:00:00Z',
    };
    listSources.mockResolvedValueOnce(fail('Sources are unavailable'));
    const { unmount } = render(<EstBackupSourcesPanel eventId="event" generation={0} onSelected={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Error: Sources are unavailable$/);
    unmount();

    listSources.mockResolvedValue(ok([source]));
    getSource.mockResolvedValue(fail('Source not found'));
    print.mockResolvedValue(fail('Print window could not open'));
    const selected = vi.fn();
    render(<EstBackupSourcesPanel eventId="event" generation={0} onSelected={selected} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use source records' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Error: Source not found$/);
    expect(selected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Print source' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Print window could not open$/));
  });
});
