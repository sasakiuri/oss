// SPDX-License-Identifier: MIT
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addNotification,
  getAnnouncementSettings,
  getBrokerConfig,
  getBrokerStatus,
  setAnnouncementSettings,
  setBrokerConfig,
  writeClipboardText,
} = vi.hoisted(() => ({
  addNotification: vi.fn(),
  getAnnouncementSettings: vi.fn(),
  getBrokerConfig: vi.fn(),
  getBrokerStatus: vi.fn(),
  setAnnouncementSettings: vi.fn(),
  setBrokerConfig: vi.fn(),
  writeClipboardText: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  competitionAnnouncementsService: {
    getSettings: getAnnouncementSettings,
    setSettings: setAnnouncementSettings,
  },
  mqttService: {
    getBrokerConfig,
    getBrokerStatus,
    setBrokerConfig,
  },
}));

vi.mock('@/renderer/presentation/stores/ui/notifications.store', () => ({
  useNotificationStore: (selector: (state: { addNotification: typeof addNotification }) => unknown) =>
    selector({ addNotification }),
}));

vi.mock('@/renderer/presentation/features/settings/ResultPublicationSettingsPanel', () => ({
  ResultPublicationSettingsPanel: () => null,
}));
vi.mock('@/renderer/presentation/features/settings/ClockQualitySettingsPanel', () => ({
  ClockQualitySettingsPanel: () => null,
}));

vi.mock('@/renderer/presentation/features/settings/OperationalArchivesPanel', () => ({
  OperationalArchivesPanel: () => null,
}));

import { SettingsScreen } from '@/renderer/presentation/features/settings/SettingsScreen';

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeClipboardText },
    });
    writeClipboardText.mockResolvedValue(undefined);
    getBrokerConfig.mockResolvedValue({
      success: true,
      data: { mode: 'embedded', url: 'mqtt://localhost:1883', port: 1883 },
    });
    getBrokerStatus.mockResolvedValue({
      success: true,
      data: {
        brokerRunning: true,
        clientConnected: true,
        brokerPort: 1883,
        localAddresses: ['192.0.2.10'],
      },
    });
    getAnnouncementSettings.mockResolvedValue({ success: true, data: { enabled: true } });
    setAnnouncementSettings.mockImplementation(async ({ enabled }: { enabled: boolean }) => ({
      success: true,
      data: { enabled },
    }));
  });

  it('restores the configured mode when an external broker connection fails', async () => {
    setBrokerConfig.mockResolvedValue({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Connection refused' },
    });
    render(<SettingsScreen />);

    const externalButton = await screen.findByRole('button', { name: 'External' });
    const embeddedButton = screen.getByRole('button', { name: 'Embedded' });
    await waitFor(() => expect(externalButton).toBeEnabled());
    fireEvent.click(externalButton);
    fireEvent.click(screen.getByRole('button', { name: 'Save and connect' }));

    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Connection refused'));
    expect(embeddedButton).toHaveAttribute('aria-pressed', 'true');
    expect(externalButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('copies a Lane connection URL', async () => {
    render(<SettingsScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy mqtt://192.0.2.10:1883' }));

    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('mqtt://192.0.2.10:1883'));
    expect(addNotification).toHaveBeenCalledWith('success', 'Connection URL copied');
  });

  it('persists the CRO rule reminder preference independently', async () => {
    render(<SettingsScreen />);

    const reminderSwitch = await screen.findByRole('switch', { name: 'CRO announcement prompts' });
    await waitFor(() => expect(reminderSwitch).toBeEnabled());
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(reminderSwitch);

    await waitFor(() => expect(setAnnouncementSettings).toHaveBeenCalledWith({ enabled: false }));
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'false');
    expect(addNotification).toHaveBeenCalledWith('success', 'Rule reminders disabled');
  });
});
