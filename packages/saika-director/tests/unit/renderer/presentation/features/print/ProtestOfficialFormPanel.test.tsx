import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProtestOfficialFormPanel } from '@/renderer/presentation/features/print/components/ProtestOfficialFormPanel';
import { createProtestFormTransfer } from '@/shared/forms/ProtestFormTransfer';

import { protestFixture } from '../../../../../helpers/protestFixture';

const { fillProtestPdf } = vi.hoisted(() => ({ fillProtestPdf: vi.fn() }));
vi.mock('@/renderer/infrastructure/forms/ProtestPdfWriter', () => ({ fillProtestPdf }));

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

  it('shows why the official PDF cannot be prepared, and the fallback text for a failure that is not an error', async () => {
    render(<ProtestOfficialFormPanel transfer={createProtestFormTransfer(protestFixture(), { timeZone: 'UTC' })} />);
    fireEvent.click(screen.getByText('Complete official PDF and check submission materials'));
    const template = screen.getByLabelText(/^Original official Form .* PDF$/);
    const oversized = new File(['%PDF'], 'form.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: 6 * 1024 * 1024 });
    fireEvent.change(template, { target: { files: [oversized] } });
    fireEvent.click(screen.getByRole('button', { name: 'Export draft official PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Select a form up to 5 MB and a font up to 30 MB\.$/);

    fillProtestPdf.mockRejectedValueOnce('unreadable');
    const form = new File(['%PDF'], 'form.pdf', { type: 'application/pdf' });
    Object.defineProperty(form, 'arrayBuffer', { value: async () => new ArrayBuffer(4) });
    fireEvent.change(template, { target: { files: [form] } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export draft official PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Unable to prepare the official form$/);
    expect(fillProtestPdf).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Export draft official PDF' })).toBeEnabled();
  });
});
