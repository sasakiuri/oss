import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ScoreCorrectionPanel } from '@/renderer/presentation/features/score-corrections/ScoreCorrectionPanel';
import type { ScoreCorrectionWorkspaceDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const { workspace, preview, apply, withdraw } = vi.hoisted(() => ({
  workspace: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  withdraw: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({ scoreCorrectionsService: { workspace, preview, apply, withdraw } }));

describe('ScoreCorrectionPanel', () => {
  it('requires preview and confirmation, and invalidates both when another correction is added', async () => {
    const basis: ScoreCorrectionWorkspaceDto['basis'] = {
      resultId: 'result',
      resultScope: 'QUALIFICATION',
      eventId: 'event',
      participantId: 'athlete',
      relayNumber: 1,
      competitionId: 'competition',
      sourceRevision: 'revision',
      seriesShotCounts: [1],
      issues: [],
      shots: [
        { scoreX10: 90, ranking: { shotId: null, ringScore: 9, decimalScore: null, innerTen: null, seriesIndex: 0 } },
      ],
    };
    workspace.mockResolvedValue(
      ok({
        basis,
        scoring: 'RING',
        history: [],
        cases: [{ id: 'case', summary: 'Missing shot', decisionId: 'decision', decision: 'Use independent record' }],
        projection: { shots: basis.shots, revision: '', ids: [], remarks: [], issues: [] },
      }),
    );
    preview.mockImplementation(async (request) =>
      ok({
        request,
        basis,
        shots: [{ ...basis.shots[0], scoreX10: 100 }],
        digest: 'digest',
        caseRevision: 'case-revision',
      }),
    );
    apply.mockResolvedValue({ success: true });
    const onChanged = vi.fn();
    render(<ScoreCorrectionPanel resultId="result" resultScope="QUALIFICATION" onChanged={onChanged} />);
    fireEvent.click(screen.getByText('Restore or correct shots from Jury evidence'));
    await screen.findByRole('option', { name: 'Missing shot' });
    fireEvent.change(screen.getByLabelText('Correction official'), { target: { value: 'Jury' } });
    fireEvent.change(screen.getByLabelText('Correction statement'), { target: { value: 'Reviewed' } });
    fireEvent.change(screen.getByLabelText('Linked Jury evidence'), { target: { value: 'case' } });
    fireEvent.change(screen.getByLabelText('Corrected score (0 for a miss or annulment)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Evidence / IR reference'), { target: { value: 'IR 12' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Jury shot correction' }));
    expect(await screen.findByRole('button', { name: 'Apply confirmed correction' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Apply confirmed correction' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add another correction' }));
    expect(screen.queryByRole('button', { name: 'Apply confirmed correction' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove correction' })[1]!);
    fireEvent.submit(screen.getByRole('form', { name: 'Jury shot correction' }));
    expect(await screen.findByRole('button', { name: 'Apply confirmed correction' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply confirmed correction' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDigest: 'digest',
        confirmed: true,
        request: expect.objectContaining({
          caseId: 'case',
          decisionId: 'decision',
          changes: [expect.objectContaining({ scoreX10: 100, evidenceReference: 'IR 12' })],
        }),
      }),
    );
  });

  describe('errors', () => {
    const basis: ScoreCorrectionWorkspaceDto['basis'] = {
      resultId: 'result',
      resultScope: 'QUALIFICATION',
      eventId: 'event',
      participantId: 'athlete',
      relayNumber: 1,
      competitionId: 'competition',
      sourceRevision: 'revision',
      seriesShotCounts: [1],
      issues: [],
      shots: [
        { scoreX10: 90, ranking: { shotId: null, ringScore: 9, decimalScore: null, innerTen: null, seriesIndex: 0 } },
      ],
    };
    const loaded = {
      basis,
      scoring: 'RING',
      history: [],
      cases: [{ id: 'case', summary: 'Missing shot', decisionId: 'decision', decision: 'Use independent record' }],
      projection: { shots: basis.shots, revision: '', ids: [], remarks: [], issues: [] },
    };

    it('shows a failed workspace load as its message or the fallback text', async () => {
      workspace.mockResolvedValueOnce(fail('Result not found'));
      const { unmount } = render(
        <ScoreCorrectionPanel resultId="result" resultScope="QUALIFICATION" onChanged={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('Restore or correct shots from Jury evidence'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/^Result not found$/);
      unmount();

      workspace.mockRejectedValueOnce('offline');
      render(<ScoreCorrectionPanel resultId="result" resultScope="QUALIFICATION" onChanged={vi.fn()} />);
      fireEvent.click(screen.getByText('Restore or correct shots from Jury evidence'));
      expect(await screen.findByRole('alert')).toHaveTextContent(/^Unable to load corrections$/);
    });

    it('shows failed previews and applications as their messages or the fallback text', async () => {
      workspace.mockResolvedValue(ok(loaded));
      preview
        .mockResolvedValueOnce(fail('The Jury decision changed'))
        .mockRejectedValueOnce('offline')
        .mockImplementationOnce(async (request) =>
          ok({ request, basis, shots: [{ ...basis.shots[0], scoreX10: 100 }], digest: 'digest', caseRevision: 'r' }),
        );
      apply.mockResolvedValueOnce(fail('The result changed after the preview'));
      const onChanged = vi.fn();
      render(<ScoreCorrectionPanel resultId="result" resultScope="QUALIFICATION" onChanged={onChanged} />);
      fireEvent.click(screen.getByText('Restore or correct shots from Jury evidence'));
      await screen.findByRole('option', { name: 'Missing shot' });
      fireEvent.change(screen.getByLabelText('Correction official'), { target: { value: 'Jury' } });
      fireEvent.change(screen.getByLabelText('Correction statement'), { target: { value: 'Reviewed' } });
      fireEvent.submit(screen.getByRole('form', { name: 'Jury shot correction' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/^Select linked evidence with a Jury decision$/);

      fireEvent.change(screen.getByLabelText('Linked Jury evidence'), { target: { value: 'case' } });
      fireEvent.change(screen.getByLabelText('Corrected score (0 for a miss or annulment)'), {
        target: { value: '10' },
      });
      fireEvent.change(screen.getByLabelText('Evidence / IR reference'), { target: { value: 'IR 12' } });
      fireEvent.submit(screen.getByRole('form', { name: 'Jury shot correction' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^The Jury decision changed$/));
      fireEvent.submit(screen.getByRole('form', { name: 'Jury shot correction' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Correction failed$/));

      fireEvent.submit(screen.getByRole('form', { name: 'Jury shot correction' }));
      await screen.findByRole('button', { name: 'Apply confirmed correction' });
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Apply confirmed correction' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/^The result changed after the preview$/);
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('shows a failed withdrawal as its message', async () => {
      workspace.mockResolvedValue(
        ok({
          ...loaded,
          history: [
            {
              application: {
                id: 'application',
                recordedAt: '2026-09-09T10:00:00.000Z',
                request: { officialName: 'Jury', statement: 'Reviewed' },
              },
              withdrawal: null,
            },
          ],
        }),
      );
      withdraw.mockResolvedValueOnce(fail('The correction was already withdrawn'));
      render(<ScoreCorrectionPanel resultId="result" resultScope="QUALIFICATION" onChanged={vi.fn()} />);
      fireEvent.click(screen.getByText('Restore or correct shots from Jury evidence'));
      await screen.findByText(/Correction application/);
      fireEvent.change(screen.getByLabelText('Correction official'), { target: { value: 'Jury' } });
      fireEvent.change(screen.getByLabelText('Correction statement'), { target: { value: 'Entered in error' } });
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw correction using the official and reason above' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/^The correction was already withdrawn$/);
    });
  });
});
