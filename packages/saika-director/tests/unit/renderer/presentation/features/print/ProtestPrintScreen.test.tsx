import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProtestPrintScreen } from '@/renderer/presentation/features/print/ProtestPrintScreen';

import { APPEAL_ID, PROTEST_ID, protestFixture } from '../../../../../helpers/protestFixture';

const { getById } = vi.hoisted(() => ({ getById: vi.fn() }));
vi.mock('@/renderer/services', () => ({ protestsService: { getById } }));

describe('ProtestPrintScreen', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes the original protest and full decision history in an appeal copy', async () => {
    const appeal = protestFixture({
      id: APPEAL_ID,
      kind: 'APPEAL',
      parentProtestId: PROTEST_ID,
      formReference: 'AP-9',
      feePaidEuro: null,
      status: 'VOID',
      entries: [
        {
          id: 'entry-1',
          caseId: APPEAL_ID,
          type: 'VOID',
          statement: 'Withdrawn\nReason <script>kept as text</script>',
          officialName: 'Appeals chair',
          ruleReference: '6.16.6',
          occurredAt: '2026-09-08T00:20:00.000Z',
          recordedAt: '2026-09-08T00:21:00.000Z',
        },
      ],
    });
    getById.mockImplementation(async ({ caseId }: { caseId: string }) => ({
      success: true,
      data: caseId === APPEAL_ID ? appeal : protestFixture(),
    }));
    const { container } = render(<ProtestPrintScreen config={{ type: 'protest-print', protestId: APPEAL_ID }} />);
    expect(await screen.findByRole('heading', { name: 'Appeal record' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Written protest record' })).toBeInTheDocument();
    expect(screen.getByText(`Original protest attached to appeal ${APPEAL_ID}`)).toBeInTheDocument();
    expect(screen.getByText('Status: VOID')).toBeInTheDocument();
    expect(screen.getByText('Official: Appeals chair')).toBeInTheDocument();
    expect(screen.getByText(/Withdrawn Reason <script>/)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('AP-9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
    expect(getById).toHaveBeenNthCalledWith(2, { caseId: PROTEST_ID });
  });

  it('disables printing when the original record cannot be loaded and retries the whole preview', async () => {
    getById
      .mockResolvedValueOnce({
        success: true,
        data: protestFixture({ id: APPEAL_ID, kind: 'APPEAL', parentProtestId: PROTEST_ID }),
      })
      .mockResolvedValueOnce({ success: false, error: { message: 'Record unavailable' } });
    render(<ProtestPrintScreen config={{ type: 'protest-print', protestId: APPEAL_ID }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot load the original protest');
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    getById.mockImplementation(async ({ caseId }: { caseId: string }) => ({
      success: true,
      data:
        caseId === APPEAL_ID
          ? protestFixture({ id: APPEAL_ID, kind: 'APPEAL', parentProtestId: PROTEST_ID, status: 'CLOSED' })
          : protestFixture(),
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Status: CLOSED')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
  });

  it('removes an earlier preview while another record loads and never prints it after a failure', async () => {
    getById.mockResolvedValueOnce({ success: true, data: protestFixture() });
    const { rerender } = render(<ProtestPrintScreen config={{ type: 'protest-print', protestId: PROTEST_ID }} />);
    await screen.findByRole('heading', { name: 'Written protest record' });
    getById.mockRejectedValueOnce(new Error('Connection lost'));
    rerender(<ProtestPrintScreen config={{ type: 'protest-print', protestId: APPEAL_ID }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.queryByRole('heading', { name: 'Written protest record' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('discards temporary transfer entries on refresh and refuses a mismatched record', async () => {
    getById.mockResolvedValue({ success: true, data: protestFixture() });
    render(<ProtestPrintScreen config={{ type: 'protest-print', protestId: PROTEST_ID }} />);
    fireEvent.click(await screen.findByText('Transfer values to a protest or appeal form'));
    fireEvent.change(screen.getByLabelText('Event for transfer'), { target: { value: 'Rifle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    fireEvent.click(await screen.findByText('Transfer values to a protest or appeal form'));
    expect(screen.getByLabelText('Event for transfer')).toHaveValue('');
    getById.mockResolvedValue({ success: true, data: protestFixture({ id: APPEAL_ID }) });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
    expect(screen.queryByText('Transfer values to a protest or appeal form')).not.toBeInTheDocument();
  });
});
