import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProtestFormTransferPanel } from '@/renderer/presentation/features/print/components/ProtestFormTransferPanel';
import { createProtestFormTransfer } from '@/shared/forms/ProtestFormTransfer';

import { APPEAL_ID, PROTEST_ID, protestFixture } from '../../../../../helpers/protestFixture';

vi.mock('@/shared/forms/ProtestFormTransfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/forms/ProtestFormTransfer')>();
  return { ...actual, createProtestFormTransfer: vi.fn(actual.createProtestFormTransfer) };
});

describe('ProtestFormTransferPanel', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('copies only on request, keeps missing fields blank, and removes values for an invalid time zone', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<ProtestFormTransferPanel protest={protestFixture({ feePaidEuro: null })} parent={null} />);
    fireEvent.click(screen.getByText('Transfer values to a protest or appeal form'));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy Fee actually received (EUR)' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Time zone (IANA, e.g. Asia/Tokyo)'), { target: { value: 'Asia/Tokyo' } });
    expect(screen.getByLabelText('Receipt time')).toHaveValue('09:10:00');
    fireEvent.click(screen.getByRole('button', { name: 'Copy Receipt time' }));
    expect(writeText).toHaveBeenCalledWith('09:10:00');
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Receipt date' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Select and copy');
    fireEvent.change(screen.getByLabelText('Time zone (IANA, e.g. Asia/Tokyo)'), { target: { value: 'wrong' } });
    expect(screen.queryByRole('button', { name: 'Copy Receipt time' })).not.toBeInTheDocument();
  });

  it('shows why form values cannot be prepared, and the fallback text for a failure that is not an error', () => {
    const appeal = protestFixture({ id: APPEAL_ID, kind: 'APPEAL', parentProtestId: PROTEST_ID });
    const { rerender } = render(<ProtestFormTransferPanel protest={appeal} parent={null} />);
    fireEvent.click(screen.getByText('Transfer values to a protest or appeal form'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      /^Load the matching original written protest before transferring an appeal$/,
    );

    vi.mocked(createProtestFormTransfer).mockImplementation(() => {
      throw 'unexpected';
    });
    rerender(<ProtestFormTransferPanel protest={protestFixture()} parent={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/^Unable to prepare form values$/);
    vi.mocked(createProtestFormTransfer).mockReset();
  });
});
