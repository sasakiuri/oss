import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorAccessPanel } from '@/renderer/presentation/features/operator-access/OperatorAccessPanel';
import { operatorAccessService } from '@/renderer/services';

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
});
