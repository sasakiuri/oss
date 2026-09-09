import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProtestOfficialFormPanel } from '@/renderer/presentation/features/print/components/ProtestOfficialFormPanel';
import { createProtestFormTransfer } from '@/shared/forms/ProtestFormTransfer';

import { protestFixture } from '../../../../../helpers/protestFixture';

describe('official PDF completion panel', () => {
  it('invalidates signature confirmations when the reviewed values change and keeps draft export explicit', () => {
    render(<ProtestOfficialFormPanel transfer={createProtestFormTransfer(protestFixture(), { timeZone: 'UTC' })} />);
    fireEvent.click(screen.getByText('Complete official PDF and check submission materials'));
    expect(screen.getByRole('button', { name: 'Export draft official PDF' })).toBeDisabled();
    const signature = screen.getByRole('checkbox', { name: /Submitter signature present/ });
    fireEvent.click(signature);
    expect(signature).toBeChecked();
    fireEvent.change(screen.getByLabelText(/Event name \(draft\)/), { target: { value: 'Air pistol' } });
    expect(signature).not.toBeChecked();
    expect(screen.getByText('Confirm Submitter signature on the signed form')).toBeInTheDocument();
  });
});
