import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ISSF_2026_RFPM } from '@sasakiuri/saika-rules';

import { MalfunctionScoreSheetPanel } from '@/renderer/presentation/features/qualification-malfunctions/MalfunctionScoreSheetPanel';
import { qualificationMalfunctionsService } from '@/renderer/services';
import type {
  MalfunctionScoreSheetDto,
  MalfunctionScoreSheetPreviewDto,
  QualificationMalfunctionCaseDto,
} from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { listScoreSheets, previewScoreSheet, saveScoreSheet, exportScoreSheet, getById } = vi.mocked(
  qualificationMalfunctionsService,
);

const CASE_ID = '66666666-6666-4666-8666-666666666666';
const SHEET_ID = '77777777-7777-4777-8777-777777777777';

const value = {
  id: CASE_ID,
  policySnapshot: structuredClone(
    ISSF_2026_RFPM.capabilities.qualificationMalfunction!,
  ) as QualificationMalfunctionCaseDto['policySnapshot'],
  stageId: 'STAGE_1',
  seriesShotLimit: 5,
  phase: 'MATCH',
  claimMode: 'CLAIM',
  status: 'EXECUTED',
  entries: [],
} as unknown as QualificationMalfunctionCaseDto;

const calculation = {
  form: 'RFPM',
  totalX10: 90,
  countedShots: [{ row: 'ORIGINAL', shotId: 'original-shot', scoreX10: 90, targetIndex: 2, addedZero: false }],
} as MalfunctionScoreSheetPreviewDto['calculation'];

const sheet = {
  id: SHEET_ID,
  version: 2,
  input: { caseId: CASE_ID, officialName: 'RTS A' },
  calculation,
} as unknown as MalfunctionScoreSheetDto;

function enterCalculation() {
  fireEvent.change(screen.getByLabelText('Original evidence source'), { target: { value: 'Memory printout' } });
  fireEvent.change(screen.getByLabelText('Original shot 1 ID'), { target: { value: 'original-shot' } });
  fireEvent.change(screen.getByLabelText('Original shot 1 score'), { target: { value: '9' } });
  fireEvent.change(screen.getByLabelText('Original shot 1 target'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Confirming official'), { target: { value: 'RTS A' } });
  fireEvent.change(screen.getByLabelText('Evidence confirmation statement'), { target: { value: 'Verified.' } });
}

describe('MalfunctionScoreSheetPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listScoreSheets.mockResolvedValue(ok([]));
    previewScoreSheet.mockImplementation(async (input) =>
      ok({ input, digest: 'a'.repeat(64), calculation } as MalfunctionScoreSheetPreviewDto),
    );
  });

  it('shows a failed list as the response message', async () => {
    listScoreSheets.mockResolvedValue(fail('Score sheets are unavailable'));
    render(<MalfunctionScoreSheetPanel value={value} disabled={false} onChanged={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Score sheets are unavailable$/);
  });

  it('shows a failed preview and a failed save as the response message', async () => {
    previewScoreSheet.mockResolvedValueOnce(fail('The original row is incomplete'));
    saveScoreSheet.mockResolvedValue(fail('The preview digest is stale'));
    render(<MalfunctionScoreSheetPanel value={value} disabled={false} onChanged={vi.fn()} />);
    await screen.findByLabelText('Original shot 1 ID');
    enterCalculation();
    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^The original row is incomplete$/);

    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save calculation' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^The preview digest is stale$/));
    expect(getById).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('announces a saved calculation and refreshes the case', async () => {
    const changed = vi.fn();
    saveScoreSheet.mockResolvedValue(ok(sheet));
    getById.mockResolvedValue(ok({ ...value, status: 'SETTLED' }));
    render(<MalfunctionScoreSheetPanel value={value} disabled={false} onChanged={changed} />);
    await screen.findByLabelText('Original shot 1 ID');
    enterCalculation();
    fireEvent.click(screen.getByRole('button', { name: 'Preview calculation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save calculation' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /^Calculation v2 saved\. Reference 77777777-7777-4777-8777-777777777777 after the official score application\.$/,
    );
    await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: 'SETTLED' })));
  });

  it('shows a completed export, then clears it when a later export fails', async () => {
    listScoreSheets.mockResolvedValue(ok([sheet]));
    exportScoreSheet.mockResolvedValueOnce(
      ok({ status: 'COMPLETED', path: '/exports/calculation.pdf', sha256: 'b'.repeat(64), sizeBytes: 10 }),
    );
    exportScoreSheet.mockResolvedValueOnce(fail('The export folder is read-only'));
    render(<MalfunctionScoreSheetPanel value={value} disabled={false} onChanged={vi.fn()} />);
    const exportButton = await screen.findByRole('button', { name: 'Export printable calculation' });
    fireEvent.click(exportButton);
    expect(await screen.findByRole('status')).toHaveTextContent(
      /^Calculation exported to \/exports\/calculation\.pdf$/,
    );

    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^The export folder is read-only$/);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(exportScoreSheet).toHaveBeenCalledWith({ id: SHEET_ID });
  });
});
