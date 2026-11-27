// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/renderer/presentation/features/settings/AppUpdateSettingsPanel', () => ({
  AppUpdateSettingsPanel: () => null,
}));
vi.mock('@/renderer/presentation/features/settings/VistaSettingsPanel', () => ({
  VistaSettingsPanel: () => null,
}));
vi.mock('@/renderer/presentation/features/settings/ClockQualitySettingsPanel', () => ({
  ClockQualitySettingsPanel: () => null,
}));

vi.mock('@/renderer/presentation/features/settings/OperationalArchivesPanel', () => ({
  OperationalArchivesPanel: () => null,
}));

import { SettingsScreen } from '@/renderer/presentation/features/settings/SettingsScreen';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const EXTERNAL_CONFIG = { mode: 'external' as const, url: 'mqtt://broker.example:1883', port: 1883 };

function expectLogged(message: string) {
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`[SettingsScreen] ${message}`), expect.any(Error));
}

describe('SettingsScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeClipboardText },
    });
    writeClipboardText.mockResolvedValue(undefined);
    getBrokerConfig.mockResolvedValue(ok({ mode: 'embedded', url: 'mqtt://localhost:1883', port: 1883 }));
    getBrokerStatus.mockResolvedValue(
      ok({
        brokerRunning: true,
        clientConnected: true,
        brokerPort: 1883,
        localAddresses: ['192.0.2.10'],
      }),
    );
    getAnnouncementSettings.mockResolvedValue(ok({ enabled: true }));
    setAnnouncementSettings.mockImplementation(async ({ enabled }: { enabled: boolean }) => ok({ enabled }));
  });

  it('restores the configured mode when an external broker connection fails', async () => {
    setBrokerConfig.mockResolvedValue(fail('Connection refused', 'INTERNAL_ERROR'));
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

  it('supports keyboard navigation and retains an unapplied broker URL across settings sections', async () => {
    render(<SettingsScreen />);
    const external = await screen.findByRole('button', { name: 'External' });
    await waitFor(() => expect(external).toBeEnabled());
    fireEvent.click(external);
    fireEvent.change(screen.getByLabelText('Broker URL'), { target: { value: 'mqtt://edited.example:1883' } });
    const network = screen.getByRole('tab', { name: 'Network' });
    network.focus();
    fireEvent.keyDown(network, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Competition' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Competition' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Updates' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(network).toHaveFocus();
    expect(screen.getByLabelText('Broker URL')).toHaveValue('mqtt://edited.example:1883');
    expect(setBrokerConfig).not.toHaveBeenCalled();
  });

  it('persists the CRO rule reminder preference independently', async () => {
    render(<SettingsScreen />);

    fireEvent.click(screen.getByRole('tab', { name: 'Competition' }));
    const reminderSwitch = await screen.findByRole('switch', { name: 'CRO announcement prompts' });
    await waitFor(() => expect(reminderSwitch).toBeEnabled());
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(reminderSwitch);

    await waitFor(() => expect(setAnnouncementSettings).toHaveBeenCalledWith({ enabled: false }));
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'false');
    expect(addNotification).toHaveBeenCalledWith('success', 'Rule reminders disabled');
  });

  it('shows the MQTT state in the header and reports each failed initial query in order', async () => {
    const config = deferred<unknown>();
    getBrokerConfig.mockReturnValueOnce(config.promise);
    getBrokerStatus.mockResolvedValueOnce(fail('Status unavailable'));
    getAnnouncementSettings.mockResolvedValueOnce(fail('Settings missing'));
    render(<SettingsScreen />);

    expect(screen.getByRole('status')).toHaveTextContent(/^Checking…$/);
    expect(screen.getByRole('button', { name: 'Embedded' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'External' })).toBeDisabled();
    await act(async () => config.resolve(fail('Config unreadable')));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^MQTT disconnected$/));
    expect(addNotification.mock.calls).toEqual([
      ['error', 'Config unreadable'],
      ['error', 'Status unavailable'],
      ['error', 'Settings missing'],
    ]);
    expect(screen.getByRole('button', { name: 'External' })).toBeEnabled();
    expect(screen.getByText('Stopped')).toBeVisible();
    expect(screen.getByText('Disconnected')).toBeVisible();
    expect(screen.queryByText('Lane connection URLs')).not.toBeInTheDocument();
  });

  it('applies nothing and reports one error when an initial query rejects', async () => {
    getBrokerConfig.mockResolvedValueOnce(ok(EXTERNAL_CONFIG));
    getBrokerStatus.mockRejectedValueOnce(new Error('IPC closed'));
    getAnnouncementSettings.mockResolvedValueOnce(ok({ enabled: false }));
    render(<SettingsScreen />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^MQTT disconnected$/));
    expect(addNotification.mock.calls).toEqual([['error', 'Failed to load network settings']]);
    expectLogged('Failed to load MQTT settings:');
    expect(screen.getByRole('button', { name: 'Embedded' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Embedded' })).toBeEnabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Competition' }));
    const reminderSwitch = screen.getByRole('switch', { name: 'CRO announcement prompts' });
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'true');
    expect(reminderSwitch).toBeEnabled();
  });

  it('refreshes the broker status and reports a failed refresh', async () => {
    render(<SettingsScreen />);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^MQTT connected$/));
    expect(screen.getByText('Running')).toBeVisible();
    expect(screen.getByText('Connected')).toBeVisible();

    const refresh = deferred<unknown>();
    getBrokerStatus.mockReturnValueOnce(refresh.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
    await act(async () =>
      refresh.resolve(
        ok({ brokerRunning: false, clientConnected: false, brokerPort: 1884, localAddresses: ['192.0.2.20'] }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByText('Stopped')).toBeVisible();
    expect(screen.getByText('Disconnected')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/^MQTT disconnected$/);
    expect(screen.getByRole('button', { name: 'Copy mqtt://192.0.2.20:1884' })).toBeVisible();

    getBrokerStatus.mockResolvedValueOnce(fail('Broker unreachable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Broker unreachable'));
    getBrokerStatus.mockRejectedValueOnce(new Error('IPC closed'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Failed to refresh network status'));
    expectLogged('Failed to refresh broker status:');
    expect(screen.getByText('Stopped')).toBeVisible();
  });

  it('switches to the embedded broker and restores the configured mode when that fails', async () => {
    getBrokerConfig.mockResolvedValue(ok(EXTERNAL_CONFIG));
    render(<SettingsScreen />);
    const embedded = screen.getByRole('button', { name: 'Embedded' });
    const external = screen.getByRole('button', { name: 'External' });
    await waitFor(() => expect(external).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByLabelText('Broker URL')).toHaveValue('mqtt://broker.example:1883');
    expect(screen.queryByText('Lane connection URLs')).not.toBeInTheDocument();

    setBrokerConfig.mockResolvedValueOnce(fail('Port in use', 'INTERNAL_ERROR'));
    fireEvent.click(embedded);
    expect(embedded).toHaveAttribute('aria-pressed', 'true');
    expect(embedded).toBeDisabled();
    expect(external).toBeDisabled();
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Port in use'));
    expect(setBrokerConfig).toHaveBeenLastCalledWith({ mode: 'embedded' });
    await waitFor(() => expect(getBrokerStatus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(embedded).toBeEnabled());
    expect(external).toHaveAttribute('aria-pressed', 'true');

    setBrokerConfig.mockResolvedValueOnce({ success: false });
    fireEvent.click(embedded);
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Failed to change broker mode'));
    await waitFor(() => expect(embedded).toBeEnabled());
    expect(external).toHaveAttribute('aria-pressed', 'true');
    expect(getBrokerStatus).toHaveBeenCalledTimes(3);

    addNotification.mockClear();
    setBrokerConfig.mockRejectedValueOnce(new Error('IPC closed'));
    fireEvent.click(embedded);
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Failed to change broker mode'));
    await waitFor(() => expect(embedded).toBeEnabled());
    expect(external).toHaveAttribute('aria-pressed', 'true');
    expect(getBrokerStatus).toHaveBeenCalledTimes(3);
    expectLogged('Failed to save broker mode:');

    const save = deferred<unknown>();
    setBrokerConfig.mockReturnValueOnce(save.promise);
    fireEvent.click(embedded);
    expect(screen.getByRole('button', { name: 'Copy mqtt://192.0.2.10:1883' })).toBeVisible();
    await act(async () => save.resolve({ success: true }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('success', 'Connected to the embedded broker'));
    await waitFor(() => expect(getBrokerStatus).toHaveBeenCalledTimes(4));
    expect(embedded).toHaveAttribute('aria-pressed', 'true');
  });

  it('saves the external broker URL as entered and reports failures', async () => {
    render(<SettingsScreen />);
    const external = screen.getByRole('button', { name: 'External' });
    await waitFor(() => expect(external).toBeEnabled());
    fireEvent.click(external);
    const url = screen.getByLabelText('Broker URL');
    expect(url).toHaveValue('mqtt://localhost:1883');
    expect(url).toHaveAttribute('placeholder', 'mqtt://localhost:1883');
    fireEvent.change(url, { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Save and connect' })).toBeDisabled();
    fireEvent.change(url, { target: { value: ' mqtts://broker.example:8883 ' } });

    const save = deferred<unknown>();
    setBrokerConfig.mockReturnValueOnce(save.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Save and connect' }));
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    expect(external).toBeDisabled();
    expect(setBrokerConfig).toHaveBeenCalledWith({ mode: 'external', url: ' mqtts://broker.example:8883 ' });
    await act(async () => save.resolve({ success: true }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('success', 'Connected to the external broker'));
    await waitFor(() => expect(getBrokerStatus).toHaveBeenCalledTimes(2));

    setBrokerConfig.mockResolvedValueOnce({ success: false });
    fireEvent.click(screen.getByRole('button', { name: 'Save and connect' }));
    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith('error', 'Failed to connect to the external broker'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save and connect' })).toBeEnabled());
    expect(external).toHaveAttribute('aria-pressed', 'true');

    addNotification.mockClear();
    setBrokerConfig.mockRejectedValueOnce(new Error('IPC closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Save and connect' }));
    await waitFor(() =>
      expect(addNotification).toHaveBeenCalledWith('error', 'Failed to connect to the external broker'),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save and connect' })).toBeEnabled());
    expect(external).toHaveAttribute('aria-pressed', 'true');
    expect(getBrokerStatus).toHaveBeenCalledTimes(3);
    expectLogged('Failed to save external broker config:');
  });

  it('reports a failed copy of a Lane connection URL', async () => {
    writeClipboardText.mockRejectedValueOnce(new Error('denied'));
    render(<SettingsScreen />);

    fireEvent.click(await screen.findByRole('button', { name: 'Copy mqtt://192.0.2.10:1883' }));

    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Failed to copy the connection URL'));
    expectLogged('Failed to copy the connection URL:');
    expect(screen.getByRole('button', { name: 'Copy mqtt://192.0.2.10:1883' })).toHaveAttribute(
      'title',
      'Copy connection URL',
    );
  });

  it('disables the rule reminder switch while it loads or saves and reports a failed save', async () => {
    const settings = deferred<unknown>();
    getAnnouncementSettings.mockReturnValueOnce(settings.promise);
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('tab', { name: 'Competition' }));
    const reminderSwitch = screen.getByRole('switch', { name: 'CRO announcement prompts' });
    expect(reminderSwitch).toBeDisabled();
    await act(async () => settings.resolve(ok({ enabled: false })));
    await waitFor(() => expect(reminderSwitch).toBeEnabled());
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'false');
    expect(reminderSwitch).toHaveTextContent('Disabled');

    const save = deferred<unknown>();
    setAnnouncementSettings.mockReturnValueOnce(save.promise);
    fireEvent.click(reminderSwitch);
    expect(reminderSwitch).toBeDisabled();
    expect(setAnnouncementSettings).toHaveBeenCalledWith({ enabled: true });
    await act(async () => save.resolve(fail('Settings are locked')));
    expect(addNotification).toHaveBeenCalledWith('error', 'Settings are locked');
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'false');
    expect(reminderSwitch).toBeEnabled();

    setAnnouncementSettings.mockRejectedValueOnce(new Error('IPC closed'));
    fireEvent.click(reminderSwitch);
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('error', 'Failed to save rule reminder settings'));
    await waitFor(() => expect(reminderSwitch).toBeEnabled());
    expectLogged('Failed to save rule reminder settings:');

    fireEvent.click(reminderSwitch);
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith('success', 'Rule reminders enabled'));
    expect(reminderSwitch).toHaveAttribute('aria-checked', 'true');
    expect(reminderSwitch).toHaveTextContent('Enabled');
  });
});
