import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MalfunctionScoreApplicationPanel } from '@/renderer/presentation/features/qualification-malfunctions/MalfunctionScoreApplicationPanel';
import type { MalfunctionScoreSheetDto, QualificationMalfunctionCaseDto } from '@/shared/ipc/contracts';
const api = vi.hoisted(() => ({
  list: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  withdraw: vi.fn(),
  getById: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  malfunctionScoreApplicationsService: api,
  qualificationMalfunctionsService: { getById: api.getById },
}));
const value = { id: 'case', status: 'EXECUTED' } as QualificationMalfunctionCaseDto;
const sheet = {
  id: 'sheet',
  version: 1,
  input: { caseId: 'case' },
  calculation: {
    form: 'RFPM',
    totalX10: 430,
    countedShots: [90, 80, 90, 70, 100].map((scoreX10, index) => ({ scoreX10, shotId: `shot-${index}` })),
  },
} as MalfunctionScoreSheetDto;
beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ success: true, data: [] });
  api.preview.mockImplementation(async (request) => ({
    success: true,
    data: {
      request,
      caseId: 'case',
      seriesIndex: 11,
      resultId: 'result',
      originalScoresX10: [90, 100, 0, 0, 0],
      replacement: { shotsX10: [90, 80, 90, 70, 100] },
      digest: 'a'.repeat(64),
    },
  }));
  api.apply.mockResolvedValue({ success: true, data: {} });
  api.withdraw.mockResolvedValue({ success: true, data: {} });
  api.getById.mockResolvedValue({ success: true, data: { ...value, status: 'SETTLED' } });
});
function identify() {
  fireEvent.change(screen.getByLabelText('Applying official'), { target: { value: 'RTS' } });
  fireEvent.change(screen.getByLabelText('Application or withdrawal statement'), {
    target: { value: 'Confirmed source evidence' },
  });
}
describe('Malfunction score application UI', () => {
  it('requires explicit ten classification and a reviewed preview before changing the score', async () => {
    const changed = vi.fn();
    render(<MalfunctionScoreApplicationPanel value={value} sheets={[sheet]} disabled={false} onChanged={changed} />);
    expect(api.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Review score applications'));
    identify();
    fireEvent.click(screen.getByText('Preview Director score change'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm every counted ten');
    expect(api.preview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Counted position 5/), { target: { value: 'INNER' } });
    fireEvent.click(screen.getByText('Preview Director score change'));
    await screen.findByText(/Series 12: original/);
    expect(api.apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Application or withdrawal statement'), {
      target: { value: 'Rechecked evidence' },
    });
    expect(screen.queryByText('Confirm evidence and apply to Director result')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Preview Director score change'));
    fireEvent.click(await screen.findByText('Confirm evidence and apply to Director result'));
    await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: 'SETTLED' })));
    expect(api.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed: true,
        expectedDigest: 'a'.repeat(64),
        request: expect.objectContaining({
          innerTens: [false, false, false, false, true],
          statement: 'Rechecked evidence',
        }),
      }),
    );
  });

  it('requires an official withdrawal statement and binds withdrawal to the saved application', async () => {
    api.list.mockResolvedValue({
      success: true,
      data: [
        {
          application: {
            id: 'application',
            seriesIndex: 11,
            request: { officialName: 'Previous RTS', statement: 'Original application' },
          },
          withdrawal: null,
        },
      ],
    });
    render(
      <MalfunctionScoreApplicationPanel
        value={{ ...value, status: 'SETTLED' }}
        sheets={[sheet]}
        disabled={false}
        onChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Review score applications'));
    const withdraw = await screen.findByText('Withdraw and reopen scoring');
    expect(withdraw).toBeDisabled();
    identify();
    fireEvent.click(withdraw);
    await waitFor(() =>
      expect(api.withdraw).toHaveBeenCalledWith(
        expect.objectContaining({
          applicationId: 'application',
          officialName: 'RTS',
          statement: 'Confirmed source evidence',
        }),
      ),
    );
  });
});
