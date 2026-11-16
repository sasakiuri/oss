// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { StatusBar } from '@/renderer/presentation/features/shared/layout/StatusBar';
import { useConnectionStore } from '@/renderer/presentation/stores/system/connection.store';

describe('StatusBar', () => {
  beforeEach(() => {
    useConnectionStore.setState({ isConnected: false, connectedChannels: [] });
  });

  it('shows the network state and the number of connected Lanes', () => {
    render(<StatusBar />);
    expect(screen.getByRole('status')).toHaveTextContent('Network offline');

    useConnectionStore.setState({ isConnected: true, connectedChannels: [1, 2] });
    render(<StatusBar />);
    expect(screen.getAllByRole('status')[1]).toHaveTextContent('Network online · 2 Lanes');
  });

  it('offers no Debug toggle, which never opened a panel', () => {
    render(<StatusBar />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Debug')).toBeNull();
  });
});
