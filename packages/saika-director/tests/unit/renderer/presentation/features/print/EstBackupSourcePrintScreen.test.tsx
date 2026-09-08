import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EstBackupSourcePrintScreen } from '@/renderer/presentation/features/print/EstBackupSourcePrintScreen';

const { getSource } = vi.hoisted(() => ({ getSource: vi.fn() }));
vi.mock('@/renderer/services', () => ({ estBackupVerificationService: { getSource } }));
describe('EST source printing', () => {
  it('prints acquired values without querying live scores and only includes original text when selected', async () => {
    getSource.mockResolvedValue({
      success: true,
      data: {
        id: 'source',
        eventId: 'event',
        fileName: 'memory.csv',
        importedAt: '2026-09-09T00:00:00Z',
        format: 'CSV',
        sha256: 'a'.repeat(64),
        sourceReference: 'Source reference',
        recordCount: 1,
        sizeBytes: 40,
        content: '<script>source text</script>',
        records: [{ key: '001', totalScore: 601.2 }],
      },
    });
    const { container, rerender } = render(
      <EstBackupSourcePrintScreen config={{ type: 'est-backup-source-print', sourceId: 'source' }} />,
    );
    expect(await screen.findByText('001')).toBeVisible();
    expect(screen.getByText('601.2')).toBeVisible();
    expect(screen.queryByText('<script>source text</script>')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include original source text' }));
    expect(screen.getByText('<script>source text</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
    getSource.mockResolvedValue({ success: false, error: { message: 'Integrity check failed' } });
    rerender(<EstBackupSourcePrintScreen config={{ type: 'est-backup-source-print', sourceId: 'other' }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Integrity check failed');
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.queryByText('001')).toBeNull();
  });
});
