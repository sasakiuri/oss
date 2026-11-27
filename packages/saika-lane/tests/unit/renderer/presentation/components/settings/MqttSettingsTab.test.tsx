// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { MqttSettingsTab } from '@/renderer/presentation/components/settings/MqttSettingsTab';

vi.mock('@/renderer/services/mqttService', () => ({
  mqttService: {
    getMqttSettings: vi.fn().mockResolvedValue({
      enabled: true,
      brokerUrl: 'mqtt://localhost:1883',
      laneAlias: 'Lane 1',
      autoConnect: true,
      laneId: 'lane',
    }),
    getMqttStatus: vi.fn().mockResolvedValue({ status: 'disconnected', error: 'Initial session replay failed' }),
  },
}));

it('shows a failed automatic initial replay and keeps manual Connect available', async () => {
  render(<MqttSettingsTab />);
  expect(await screen.findByText('Initial session replay failed')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
});
