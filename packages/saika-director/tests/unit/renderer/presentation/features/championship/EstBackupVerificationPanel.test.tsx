import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EstBackupVerificationPanel } from '@/renderer/presentation/features/championship/components/EstBackupVerificationPanel';

const { list, importDelimitedRecords, verify } = vi.hoisted(() => ({
  list: vi.fn(),
  importDelimitedRecords: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({ estBackupVerificationService: { list, importDelimitedRecords, verify } }));

describe('EST backup import preview', () => {
  it('sends explicit mappings, retains provenance only for unedited records, and requires a separate comparison action', async () => {
    list.mockResolvedValue({ success: true, data: [] });
    importDelimitedRecords.mockResolvedValue({
      success: true,
      data: {
        status: 'IMPORTED',
        fileName: 'export.csv',
        sizeBytes: 30,
        sha256: 'a'.repeat(64),
        format: 'MAPPED_DELIMITED_V1',
        sourceName: 'export.csv',
        sourceReference: 'File hash and column mapping',
        records: [{ key: '001', rank: 1, totalScore: 630.1 }],
      },
    });
    verify.mockResolvedValue({ success: true, data: {} });
    render(<EstBackupVerificationPanel eventId="event" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('File layout'), { target: { value: 'MAPPED' } });
    fireEvent.change(screen.getByLabelText('Decimal separator'), { target: { value: ',' } });
    fireEvent.change(screen.getByLabelText('Rank column (optional)'), { target: { value: 'Place' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import delimited file' }));
    const reference = screen.getByLabelText('Source reference / media identifier');
    await waitFor(() => expect(reference).toHaveValue('File hash and column mapping'));
    expect(importDelimitedRecords).toHaveBeenCalledWith({
      delimiter: ';',
      decimalSeparator: ',',
      keyColumn: 'Bib',
      totalScoreColumn: 'Total',
      rankColumn: 'Place',
    });
    expect(reference).toHaveAttribute('readonly');
    expect(verify).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('RTS official'), { target: { value: 'Jury' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare and retain' }));
    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceReference: 'File hash and column mapping',
          records: [{ key: '001', rank: 1, totalScore: 630.1 }],
        }),
      ),
    );
    fireEvent.change(screen.getByLabelText(/Backup records JSON/), {
      target: { value: '[{"key":"001","totalScore":629}]' },
    });
    expect(reference).toHaveValue('');
    expect(reference).not.toHaveAttribute('readonly');
  });
});
