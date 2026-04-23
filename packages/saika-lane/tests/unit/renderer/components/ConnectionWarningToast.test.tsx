// SPDX-License-Identifier: MIT
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionWarningToast } from '@/renderer/presentation/components/ConnectionWarningToast';
import { useConnectionNotificationStore } from '@/renderer/presentation/stores/connectionNotificationStore';

vi.mock('lucide-react', () => ({
  AlertTriangle: () => <svg data-testid="alert-triangle-icon" />,
  X: () => <svg data-testid="x-icon" />,
}));

describe('ConnectionWarningToast', () => {
  beforeEach(() => {
    useConnectionNotificationStore.getState().dismiss();
    vi.clearAllMocks();
  });

  it('renders nothing when no notification is active', () => {
    const { container } = render(<ConnectionWarningToast onOpenSettings={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the warning when a notification is active', () => {
    useConnectionNotificationStore.getState().showUnexpectedDisconnect('USB device disconnected unexpectedly');

    render(<ConnectionWarningToast onOpenSettings={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Target Disconnected');
    expect(screen.getByText('USB device disconnected unexpectedly')).toBeInTheDocument();
  });

  it('opens connection settings and dismisses the notification', () => {
    const onOpenSettings = vi.fn();
    useConnectionNotificationStore.getState().showUnexpectedDisconnect('USB device disconnected unexpectedly');

    render(<ConnectionWarningToast onOpenSettings={onOpenSettings} />);

    fireEvent.click(screen.getByText('Open Connection Settings'));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(useConnectionNotificationStore.getState().notification).toBeNull();
  });
});
