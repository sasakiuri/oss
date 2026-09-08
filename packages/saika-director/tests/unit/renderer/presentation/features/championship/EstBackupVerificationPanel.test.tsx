import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EstBackupVerificationPanel } from '@/renderer/presentation/features/championship/components/EstBackupVerificationPanel';

const { list, captureRecords, verify } = vi.hoisted(() => ({
  list: vi.fn(),
  captureRecords: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  estBackupVerificationService: {
    getCapture: vi.fn(async ({ eventId }: { eventId: string }) => ({
      success: true,
      data: {
        eventId,
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
      },
    })),
    list,
    captureRecords,
    verify,
    listSources: vi.fn(async () => ({ success: true, data: [] })),
  },
}));

describe('EST backup import preview', () => {
  beforeEach(() => vi.clearAllMocks());
  it('keeps Final comparisons separate and submits Mixed Team identity and scope', async () => {
    list.mockResolvedValue({ success: true, data: [] });
    verify.mockResolvedValue({ success: true, data: {} });
    render(
      <EstBackupVerificationPanel eventId="event" resultScope="FINAL" initialKind="MIXED_TEAM" onClose={() => {}} />,
    );
    expect(screen.getByLabelText('Result kind')).toHaveValue('MIXED_TEAM');
    expect(screen.getByLabelText('Comparison key')).toHaveValue('TEAM_ID');
    expect(screen.queryByRole('option', { name: /^Team$/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Printout or independent-memory source'), {
      target: { value: 'Final target memory' },
    });
    fireEvent.change(screen.getByLabelText('RTS official'), { target: { value: 'Jury' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare and retain' }));
    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({
          resultScope: 'FINAL',
          resultKind: 'MIXED_TEAM',
          keyType: 'TEAM_ID',
          sourceName: 'Final target memory',
        }),
      ),
    );
  });
  it('sends explicit mappings, retains provenance only for unedited records, and requires a separate comparison action', async () => {
    list.mockResolvedValue({ success: true, data: [] });
    captureRecords.mockResolvedValue({
      success: true,
      data: {
        status: 'IMPORTED',
        sourceId: 'retained-source',
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
    expect(captureRecords).toHaveBeenCalledWith({
      eventId: 'event',
      mapping: {
        delimiter: ';',
        decimalSeparator: ',',
        keyColumn: 'Bib',
        totalScoreColumn: 'Total',
        rankColumn: 'Place',
      },
    });
    expect(reference).toHaveAttribute('readonly');
    expect(verify).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('RTS official'), { target: { value: 'Jury' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare and retain' }));
    await waitFor(() =>
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: 'retained-source',
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
