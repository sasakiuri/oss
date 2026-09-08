import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EstBackupResultChecksPanel } from '@/renderer/presentation/features/championship/components/EstBackupResultChecksPanel';
import type { EstBackupVerificationRunDto } from '@/shared/ipc/contracts';
const { previewChecks, applyChecks } = vi.hoisted(() => ({ previewChecks: vi.fn(), applyChecks: vi.fn() }));
vi.mock('@/renderer/services', () => ({ estBackupVerificationService: { previewChecks, applyChecks } }));
const run: EstBackupVerificationRunDto = {
  id: 'run',
  eventId: 'event',
  resultKind: 'INDIVIDUAL',
  keyType: 'START_NUMBER',
  sourceName: 'Memory export',
  sourceReference: 'File hash',
  verified: true,
  items: [],
  snapshotRevision: 'a'.repeat(64),
  officialName: 'RTS official',
  verifiedAt: '2026-09-09T00:00:00Z',
  interventionReviewStatement: 'Reviewed',
};
const preview = {
  eventId: 'event',
  runId: 'run',
  digest: 'b'.repeat(64),
  items: [
    {
      key: '001',
      resultId: 'result1',
      name: 'Athlete A',
      rank: 1,
      totalScore: 630,
      interventionCount: 1,
      state: 'READY',
      issue: null,
    },
    {
      key: '002',
      resultId: 'result2',
      name: 'Athlete B',
      rank: 2,
      totalScore: 629,
      interventionCount: 0,
      state: 'READY',
      issue: null,
    },
    {
      key: '003',
      resultId: 'result3',
      name: 'Athlete C',
      rank: 3,
      totalScore: 628,
      interventionCount: 0,
      state: 'BLOCKED',
      issue: 'Result changed; compare again',
    },
  ],
};
describe('EST individual check handoff', () => {
  it('requires explicit source and intervention review, sends only the selected preview, and displays partial outcomes', async () => {
    previewChecks.mockResolvedValue({ success: true, data: preview });
    applyChecks.mockResolvedValue({
      success: true,
      data: { items: [{ resultId: 'result1', state: 'FAILED', checkId: null, issue: 'Concurrent result change' }] },
    });
    render(<EstBackupResultChecksPanel run={run} />);
    expect(previewChecks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview individual RTS checks' }));
    const save = await screen.findByRole('button', { name: 'Record selected RTS checks' });
    expect(save).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Verify Athlete C' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Verify Athlete B' }));
    fireEvent.change(screen.getByLabelText('Backup evidence type'), { target: { value: 'INDEPENDENT_MEMORY' } });
    fireEvent.change(screen.getByLabelText('Source and intervention review'), {
      target: { value: 'Compared target memory and the incident report' },
    });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed the backup/ }));
    fireEvent.click(save);
    await waitFor(() =>
      expect(applyChecks).toHaveBeenCalledWith({
        eventId: 'event',
        runId: 'run',
        digest: preview.digest,
        resultIds: ['result1'],
        evidenceSource: 'INDEPENDENT_MEMORY',
        officialName: 'RTS official',
        statement: 'Compared target memory and the incident report',
        manualInterventionsReviewed: true,
      }),
    );
    expect(await screen.findByText(/Athlete A: FAILED.*Concurrent result change/)).toBeInTheDocument();
    await waitFor(() => expect(save).toBeDisabled());
  });
});
