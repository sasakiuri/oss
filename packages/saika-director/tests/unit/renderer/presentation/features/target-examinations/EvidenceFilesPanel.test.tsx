import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvidenceFilesPanel } from '@/renderer/presentation/features/target-examinations/EvidenceFilesPanel';

import { fail } from '../../../../../helpers/renderer/serviceResponses';

const api = vi.hoisted(() => ({ list: vi.fn(), importFile: vi.fn(), exportFile: vi.fn() }));
vi.mock('@/renderer/services', () => ({ evidenceFilesService: api }));

describe('Evidence file operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue({ success: true, data: [] });
  });
  it('imports only after an official supplies a custody statement and binds the selected evidence item', async () => {
    api.importFile.mockResolvedValue({ success: true, data: null });
    render(<EvidenceFilesPanel caseId="case" evidenceId="evidence" canImport />);
    expect(api.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stored evidence files' }));
    await screen.findByText('No files stored for this item.');
    const button = screen.getByRole('button', { name: 'Choose and import original file' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Importing official'), { target: { value: 'Jury A' } });
    fireEvent.change(screen.getByLabelText('File custody statement'), {
      target: { value: 'Lane 3, original EST log' },
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.importFile).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: 'case',
          evidenceId: 'evidence',
          importedBy: 'Jury A',
          statement: 'Lane 3, original EST log',
        }),
      ),
    );
  });
  it('permits verified copies from closed cases while withholding the import action', async () => {
    api.list.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'file',
          fileName: 'log.pdf',
          sizeBytes: 12,
          importedAt: '2026-09-07T00:00:00.000Z',
          importedBy: 'Jury',
          statement: 'Original',
          sha256: 'a'.repeat(64),
        },
      ],
    });
    api.exportFile.mockResolvedValue({ success: false, error: { message: 'Evidence file SHA-256 mismatch' } });
    render(<EvidenceFilesPanel caseId="case" evidenceId="evidence" canImport={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stored evidence files' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save verified copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('SHA-256 mismatch');
    expect(screen.queryByRole('button', { name: 'Choose and import original file' })).not.toBeInTheDocument();
  });
  it('shows a failed load and a failed import as the response message', async () => {
    api.list.mockResolvedValue(fail('Evidence storage is unavailable'));
    api.importFile.mockResolvedValue(fail('The original file exceeds 32 MiB'));
    render(<EvidenceFilesPanel caseId="case" evidenceId="evidence" canImport />);
    fireEvent.click(screen.getByRole('button', { name: 'Stored evidence files' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Evidence storage is unavailable$/);
    fireEvent.change(screen.getByLabelText('Importing official'), { target: { value: 'Jury A' } });
    fireEvent.change(screen.getByLabelText('File custody statement'), { target: { value: 'Lane 3 log' } });
    fireEvent.click(screen.getByRole('button', { name: 'Choose and import original file' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^The original file exceeds 32 MiB$/));
    expect(api.list).toHaveBeenCalledOnce();
  });
  it('shows a failed export as the response message and a rejected value as text', async () => {
    api.list.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'file',
          fileName: 'log.pdf',
          sizeBytes: 12,
          importedAt: '2026-09-07T00:00:00.000Z',
          importedBy: 'Jury',
          statement: 'Original',
          sha256: 'a'.repeat(64),
        },
      ],
    });
    api.exportFile.mockResolvedValue(fail('Evidence file SHA-256 mismatch'));
    render(<EvidenceFilesPanel caseId="case" evidenceId="evidence" canImport={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stored evidence files' }));
    const save = await screen.findByRole('button', { name: 'Save verified copy' });
    fireEvent.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Evidence file SHA-256 mismatch$/);
    api.exportFile.mockRejectedValue('disk full');
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^disk full$/));
  });
});
