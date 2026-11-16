import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorAccessPanel } from '@/renderer/presentation/features/operator-access/OperatorAccessPanel';
import { operatorAccessService } from '@/renderer/services';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', () => ({
  operatorAccessService: {
    status: vi.fn(),
    signIn: vi.fn(),
    saveAccount: vi.fn(),
    setEnabled: vi.fn(),
    getAdministration: vi.fn(),
  },
}));
describe('OperatorAccessPanel', () => {
  beforeEach(() => vi.clearAllMocks());
  it('retains an authentication failure and does not report that the operator signed in', async () => {
    vi.mocked(operatorAccessService.status).mockResolvedValue({
      success: true,
      data: { enabled: true, setupRequired: false, actor: null, expiresAt: null },
    });
    vi.mocked(operatorAccessService.signIn).mockResolvedValue({
      success: false,
      error: { code: 'COMMAND_ERROR', message: 'Invalid operator name or password' },
    });
    render(<OperatorAccessPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Signed out/ }));
    fireEvent.change(screen.getByLabelText('Operator name'), { target: { value: 'Range A' } });
    fireEvent.change(screen.getByLabelText('Operator password'), { target: { value: 'incorrect' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid operator name or password');
    expect(screen.queryByText('Signed in: Range A')).not.toBeInTheDocument();
  });
  it('creates the first administrator without automatically requiring sign-in for operations', async () => {
    vi.mocked(operatorAccessService.status).mockResolvedValue({
      success: true,
      data: { enabled: false, setupRequired: true, actor: null, expiresAt: null },
    });
    vi.mocked(operatorAccessService.saveAccount).mockResolvedValue({
      success: true,
      data: { enabled: false, setupRequired: true, actor: null, expiresAt: null },
    });
    render(<OperatorAccessPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Manual operation/ }));
    expect(screen.getByText('Create the first administrator')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Admin A' } });
    fireEvent.change(screen.getByLabelText('New password (at least 10 characters)'), {
      target: { value: 'a long password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save operator account' }));
    await waitFor(() =>
      expect(operatorAccessService.saveAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Admin A',
          permissions: ['ADMIN'],
          officialRoles: [],
          password: 'a long password',
        }),
      ),
    );
    expect(operatorAccessService.setEnabled).not.toHaveBeenCalled();
  });
  it('shows failed status and administration loads and a failed account save as their messages', async () => {
    vi.mocked(operatorAccessService.status).mockResolvedValue(fail('Access status is unavailable'));
    const { unmount } = render(<OperatorAccessPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Operator: Access status unavailable' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Access status is unavailable$/);
    unmount();

    vi.mocked(operatorAccessService.status).mockResolvedValue(
      ok({
        enabled: true,
        setupRequired: false,
        actor: {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Admin A',
          permissions: ['ADMIN' as const],
          officialRoles: [],
          disabled: false,
        },
        expiresAt: null,
      }),
    );
    vi.mocked(operatorAccessService.getAdministration).mockResolvedValue(fail('Operator records are unavailable'));
    vi.mocked(operatorAccessService.saveAccount).mockResolvedValue(fail('Account name is already used', 'CONFLICT'));
    render(<OperatorAccessPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Operator: Admin A' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Operator records are unavailable$/);
    fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Range B' } });
    fireEvent.change(screen.getByLabelText('New password (at least 10 characters)'), {
      target: { value: 'a long password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save operator account' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Account name is already used$/));
    expect(operatorAccessService.saveAccount).toHaveBeenCalledOnce();
  });
});
