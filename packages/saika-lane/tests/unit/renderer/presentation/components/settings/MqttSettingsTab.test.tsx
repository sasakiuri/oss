// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MqttSettingsTab } from '@/renderer/presentation/components/settings/MqttSettingsTab';
import { useMqttStore } from '@/renderer/presentation/stores/mqttStore';
import { mqttService } from '@/renderer/services/mqttService';
import type { MqttStatus } from '@/shared/ipc/contracts';

import { emit } from '../../../../../helpers/mockElectronAPI';

vi.mock('@/renderer/services/mqttService', () => ({
  mqttService: {
    getMqttSettings: vi.fn(),
    getMqttStatus: vi.fn(),
    saveMqttSettings: vi.fn(),
    connectMqtt: vi.fn(),
    disconnectMqtt: vi.fn(),
  },
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Renders the tab and waits until the saved settings fill the form. */
async function renderLoaded() {
  render(<MqttSettingsTab />);
  await waitFor(() => expect(screen.getByLabelText('Broker URL')).toHaveValue('mqtt://localhost:1883'));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled());
}

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

it('shows why the saved settings could not be read and leaves the form empty', async () => {
  vi.mocked(mqttService.getMqttSettings).mockRejectedValue(new Error('Settings file is unreadable'));
  render(<MqttSettingsTab />);

  expect(await screen.findByText('Settings file is unreadable')).toBeVisible();
  expect(screen.getByLabelText('Enable MQTT')).not.toBeChecked();
  expect(screen.getByLabelText('Broker URL')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
});

describe('saving', () => {
  it('saves the edited fields with the read-only Lane ID and clears the previous error', async () => {
    vi.mocked(mqttService.saveMqttSettings).mockResolvedValue(undefined);
    await renderLoaded();
    expect(screen.getByText('Initial session replay failed')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Broker URL'), { target: { value: 'mqtts://range.example:8883' } });
    fireEvent.change(screen.getByLabelText('Lane Alias'), { target: { value: 'Lane 2' } });
    fireEvent.click(screen.getByLabelText('Auto Connect'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled());
    expect(mqttService.saveMqttSettings).toHaveBeenCalledExactlyOnceWith({
      enabled: true,
      brokerUrl: 'mqtts://range.example:8883',
      laneAlias: 'Lane 2',
      autoConnect: false,
      laneId: 'lane',
    });
    expect(screen.queryByText('Initial session replay failed')).not.toBeInTheDocument();
  });

  it('disables Save while the settings are written and shows a failure', async () => {
    const save = deferred();
    vi.mocked(mqttService.saveMqttSettings).mockReturnValue(save.promise);
    await renderLoaded();

    fireEvent.click(screen.getByLabelText('Enable MQTT'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled();
    expect(mqttService.saveMqttSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));

    await act(async () => save.reject(new Error('Disk is full')));

    expect(screen.getByText('Disk is full')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeEnabled();
  });
});

describe('connecting', () => {
  it('shows Connecting while the broker answers, then offers Disconnect', async () => {
    const connection = deferred();
    vi.mocked(mqttService.connectMqtt).mockReturnValue(connection.promise);
    await renderLoaded();

    fireEvent.change(screen.getByLabelText('Lane Alias'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(mqttService.connectMqtt).toHaveBeenCalledExactlyOnceWith({
      brokerUrl: 'mqtt://localhost:1883',
      laneAlias: undefined,
      autoConnect: true,
    });
    expect(screen.getByText('connecting')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connecting...' })).toBeDisabled();
    expect(screen.queryByText('Initial session replay failed')).not.toBeInTheDocument();

    await act(async () => connection.resolve());

    expect(screen.getByText('connected')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
  });

  it('sends the alias when one is entered', async () => {
    vi.mocked(mqttService.connectMqtt).mockResolvedValue(undefined);
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await screen.findByRole('button', { name: 'Disconnect' });
    expect(mqttService.connectMqtt).toHaveBeenCalledExactlyOnceWith({
      brokerUrl: 'mqtt://localhost:1883',
      laneAlias: 'Lane 1',
      autoConnect: true,
    });
  });

  it('returns to disconnected and shows the broker error when connecting fails', async () => {
    vi.mocked(mqttService.connectMqtt).mockRejectedValue(new Error('Connection refused'));
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('Connection refused')).toBeVisible();
    expect(screen.getByText('disconnected')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });
});

describe('disconnecting', () => {
  beforeEach(() => {
    vi.mocked(mqttService.getMqttStatus).mockResolvedValue({ status: 'connected' });
  });

  it('disconnects and offers Connect again', async () => {
    vi.mocked(mqttService.disconnectMqtt).mockResolvedValue(undefined);
    await renderLoaded();

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));

    expect(await screen.findByRole('button', { name: 'Connect' })).toBeEnabled();
    expect(mqttService.disconnectMqtt).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByText('disconnected')).toBeVisible();
  });

  it('stays connected and shows the error when disconnecting fails', async () => {
    vi.mocked(mqttService.disconnectMqtt).mockRejectedValue(new Error('Broker did not answer'));
    await renderLoaded();

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));

    expect(await screen.findByText('Broker did not answer')).toBeVisible();
    expect(screen.getByText('connected')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
  });
});
