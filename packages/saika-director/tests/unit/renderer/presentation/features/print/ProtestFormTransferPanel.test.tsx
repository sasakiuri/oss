import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProtestFormTransferPanel } from '@/renderer/presentation/features/print/components/ProtestFormTransferPanel';

import { protestFixture } from '../../../../../helpers/protestFixture';

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
});
