// SPDX-License-Identifier: MIT
import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MqttSettingsTab } from '@/renderer/presentation/components/settings/MqttSettingsTab';
import { useMqttStore } from '@/renderer/presentation/stores/mqttStore';
import { mqttService } from '@/renderer/services/mqttService';
import type { MqttStatus } from '@/shared/ipc/contracts';

import { emit } from '../../../../../helpers/mockElectronAPI';

vi.mock('@/renderer/services/mqttService', () => ({
  mqttService: {
    getMqttSettings: vi.fn(),
    getMqttStatus: vi.fn(),
  },
}));

beforeEach(() => {
  useMqttStore.setState({ status: 'disconnected', error: null, isLoading: false });
  vi.mocked(mqttService.getMqttSettings).mockResolvedValue({
    enabled: true,
    brokerUrl: 'mqtt://localhost:1883',
    laneAlias: 'Lane 1',
    autoConnect: true,
    laneId: 'lane',
  });
  vi.mocked(mqttService.getMqttStatus).mockResolvedValue({
    status: 'disconnected',
    error: 'Initial session replay failed',
  });
});

it('shows a failed automatic initial replay and keeps manual Connect available', async () => {
  render(<MqttSettingsTab />);
  expect(await screen.findByText('Initial session replay failed')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
});

it('keeps a status pushed while the initial query is still pending', async () => {
  let resolveStatus!: (status: MqttStatus) => void;
  vi.mocked(mqttService.getMqttStatus).mockReturnValue(
    new Promise((resolve) => {
      resolveStatus = resolve;
    }),
  );
  render(<MqttSettingsTab />);

  act(() => emit('mqttStatusChanged', { status: 'connected' }));
  await act(async () => resolveStatus({ status: 'disconnected', error: 'Initial session replay failed' }));

  expect(screen.getByText('connected')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
  expect(screen.queryByText('Initial session replay failed')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Broker URL')).toHaveValue('mqtt://localhost:1883');
});
