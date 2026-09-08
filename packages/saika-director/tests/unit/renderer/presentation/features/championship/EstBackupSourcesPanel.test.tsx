import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EstBackupSourcesPanel } from '@/renderer/presentation/features/championship/components/EstBackupSourcesPanel';

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
});
