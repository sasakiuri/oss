// SPDX-License-Identifier: MIT
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Operator } from '../../src/renderer/Operator';
import type { AppState, Command, VistaBridge } from '../../src/shared/model';
import { publishedSnapshot, screenConfig, snapshot } from '../fixtures';
import { updateBridge } from '../updateFixtures';

let state: AppState;
let bridge: VistaBridge;
beforeEach(() => {
  window.vistaUpdates = updateBridge();
  const data = snapshot();
  state = {
    local: {
      identity: { protocolVersion: 1, sourceId: 'display-one', bootId: 'boot', kind: 'display', name: 'Control PC' },
      monitors: [{ id: 'monitor-one', name: 'HDMI 1', width: 1920, height: 1080, primary: false }],
      screens: [
        {
          config: screenConfig(),
          appliedRevision: 1,
          renderedRevision: 1,
          renderAlive: true,
          monitorAvailable: true,
          error: null,
        },
      ],
      controllerId: null,
      persistenceError: null,
      resumableSubjects: [],
    },
    endpoints: ['http://127.0.0.1:4180'],
    pairingSecret: 's'.repeat(32),
    sources: [
      {
        id: 'lane-one',
        endpoint: 'http://192.168.1.2:4180',
        state: 'connected',
        error: null,
        catalog: {
          identity: { protocolVersion: 1, sourceId: 'lane-one', bootId: 'boot', kind: 'lane', name: 'Lane one' },
          subjects: [
            {
              id: 'session-one',
              label: 'Morning session',
              eventCode: 'AR60',
              competition: null,
              relay: null,
              availability: 'available',
              reason: null,
            },
          ],
        },
      },
    ],
    peers: [],
    snapshots: [{ snapshot: data, state: 'live', receivedAt: Date.now(), error: null }],
    error: null,
    loginStart: false,
  };
  bridge = {
    getState: vi.fn(async () => structuredClone(state)),
    command: vi.fn(async (command: Command) => {
      if (command.type === 'apply')
        state.local.screens[0] = {
          ...state.local.screens[0]!,
          config: command.config,
          appliedRevision: command.config.revision,
        };
    }),
    discover: vi.fn(async () => [
      {
        identity: {
          protocolVersion: 1 as const,
          sourceId: 'lane-two',
          bootId: 'b',
          kind: 'lane' as const,
          name: 'Lane two',
        },
        endpoint: 'http://192.168.1.3:4180',
      },
    ]),
    getAudience: vi.fn(),
    rendered: vi.fn(),
    onChange: vi.fn(() => () => undefined),
  };
  window.vista = bridge;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('operator workflows', () => {
  it('keeps rendering distinct from unconfirmed storage and allows saving the current settings again', async () => {
    state.local.persistenceError = 'Vista data was replaced, but durable storage was not confirmed';
    state.local.screens[0]!.appliedRevision = null;
    state.error = state.local.persistenceError;
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    expect(screen.getByText('Confirmed v1')).toBeInTheDocument();
    expect(screen.getByText('Unconfirmed', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('Storage unconfirmed')).toBeInTheDocument();
    expect(screen.queryByText('No changes')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('durable storage was not confirmed');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
    await waitFor(() =>
      expect(bridge.command).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'apply',
          config: expect.objectContaining({ revision: 2 }),
        }),
      ),
    );
  });

  it('counts published Final result rows and keeps target selections separate from that result scope', async () => {
    state.sources[0]!.catalog!.identity.kind = 'director';
    state.local.screens[0]!.config = { ...screenConfig(), view: 'final', slots: 1 };
    state.local.screens[0]!.config.selections[0]!.participantIds = ['lane-one'];
    state.snapshots[0]!.snapshot = publishedSnapshot();
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    expect(screen.getByText(/2 selected positions · 2 pages/)).toBeInTheDocument();
    expect(screen.getByLabelText('Rows per page')).toHaveValue(1);
    expect(screen.getByLabelText('Starting page')).toHaveAttribute('max', '2');
    expect(screen.getByText(/complete selected result scope/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Lane 1 · Current run athlete/)).toBeDisabled();
    const status = screen.getByRole('region', { name: 'Source data for requested settings' });
    expect(within(status).queryByText(/Partial history/)).not.toBeInTheDocument();
    expect(within(status).getByText('Live').closest('.status-pill')).toHaveClass('good');
    fireEvent.click(screen.getByRole('button', { name: 'Target grid' }));
    expect(screen.getByLabelText(/Lane 1 · Current run athlete/)).toBeEnabled();
    expect(screen.getByLabelText(/Lane 1 · Current run athlete/)).toBeChecked();
    expect(screen.getByText(/1 selected position · 1 page/)).toBeInTheDocument();
  });

  it('keeps inherited Final page counts unknown without its result snapshot even with fixed target selections', async () => {
    state.sources[0]!.catalog!.identity.kind = 'director';
    state.local.screens[0]!.config = { ...screenConfig(), view: 'final' };
    state.local.screens[0]!.config.selections[0]!.participantIds = ['lane-one'];
    state.snapshots = [];
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    expect(screen.getByText(/Position and page counts are unavailable on this PC/)).toBeInTheDocument();
    expect(screen.getByLabelText('Starting page')).not.toHaveAttribute('max');
    fireEvent.change(screen.getByLabelText('Starting page'), { target: { value: '3' } });
    expect(screen.getByLabelText('Starting page')).toHaveValue(3);
  });
  it('holds edits as a draft until explicit Apply and reports persistence separately from rendering', async () => {
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'East stand' } });
    expect(bridge.command).not.toHaveBeenCalled();
    expect(screen.getByText('Unapplied changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
    await waitFor(() =>
      expect(bridge.command).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'apply',
          nodeId: 'display-one',
          config: expect.objectContaining({ name: 'East stand', revision: 2 }),
        }),
      ),
    );
    expect(await screen.findByText('Last v1 · unconfirmed')).toBeInTheDocument();
    expect(screen.getAllByText('v2').length).toBeGreaterThan(0);
  });
  it('retains unapplied edits when navigation is cancelled and discards them only on confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Unapplied name' } });
    fireEvent.click(screen.getByRole('button', { name: /Data sources/ }));
    expect(confirm).toHaveBeenCalledWith('Discard unapplied screen changes?');
    expect(screen.getByLabelText('Screen name')).toHaveValue('Unapplied name');
    expect(bridge.command).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Data sources/ }));
    expect(screen.getByRole('heading', { name: 'Data sources' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Screens/ }));
    expect(screen.getByLabelText('Screen name')).toHaveValue('North stand');
    expect(state.local.screens[0]!.config.name).toBe('North stand');
  });

  it('does not discard a draft when selecting its current screen and clears the guard after applying', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'East stand' } });
    fireEvent.click(screen.getByRole('button', { name: /North stand/ }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Screen name')).toHaveValue('East stand');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
    await screen.findByText('No changes');
    fireEvent.click(screen.getByRole('button', { name: /Data sources/ }));
    expect(confirm).not.toHaveBeenCalled();
    expect(state.local.screens[0]!.config.name).toBe('East stand');
  });

  it('protects a draft when selecting another screen or closing the editor', async () => {
    state.local.screens.push({
      ...state.local.screens[0]!,
      config: { ...screenConfig(), id: 'second-screen', name: 'South stand' },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Unapplied name' } });
    fireEvent.click(screen.getByRole('button', { name: /South stand/ }));
    expect(screen.getByLabelText('Screen name')).toHaveValue('Unapplied name');
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(screen.getByLabelText('Screen name')).toHaveValue('Unapplied name');
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /South stand/ }));
    expect(screen.getByLabelText('Screen name')).toHaveValue('South stand');
    expect(bridge.command).not.toHaveBeenCalled();
  });

  it('keeps a new unsaved screen guarded when it is opened again after discarding edits', async () => {
    state.local.screens = [];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add screen · HDMI 1' }));
    expect(screen.getByText('Unapplied changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Data sources/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('region', { name: 'Screen editor' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Unsaved screen' } });
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Data sources/ }));
    fireEvent.click(screen.getByRole('button', { name: /Screens/ }));
    expect(screen.getByLabelText('Screen name')).toHaveValue('HDMI 1');
    expect(screen.getByText('Unapplied changes')).toBeInTheDocument();
    confirm.mockClear().mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(state.local.screens).toEqual([]);
    expect(bridge.command).not.toHaveBeenCalled();
  });

  it('keeps irrelevant appearance controls inactive for result rows', async () => {
    state.sources[0]!.catalog!.identity.kind = 'director';
    state.local.screens[0]!.config = { ...screenConfig(), view: 'ranking', autoRotate: false };
    state.snapshots[0]!.snapshot = publishedSnapshot();
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    for (const label of ['Target zoom', 'Shot display', 'Recent shot count', 'Seconds per page'])
      expect(screen.getByLabelText(label)).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Target grid' }));
    expect(screen.getByLabelText('Target zoom')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Shot display'), { target: { value: 'recent' } });
    expect(screen.getByLabelText('Recent shot count')).toBeEnabled();
  });

  it('persists standby without replacing the configured subjects or unsaved editor content', async () => {
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Unapplied name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Standby' }));
    await waitFor(() =>
      expect(bridge.command).toHaveBeenCalledWith({
        type: 'apply',
        nodeId: 'display-one',
        config: { ...screenConfig(2), standby: true },
      }),
    );
    expect(screen.getByLabelText('Screen name')).toHaveValue('Unapplied name');
    fireEvent.click(await screen.findByRole('button', { name: 'Resume display' }));
    await waitFor(() =>
      expect(bridge.command).toHaveBeenLastCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ standby: false, revision: 3, name: 'North stand' }),
        }),
      ),
    );
  });
  it('rejects ranking for Lane sources and keeps multiple source selections available for target grids', async () => {
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ranking' }));
    expect(screen.getByText(/Ranking and final standings require/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply to screen' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Target grid' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add source' }));
    expect(screen.getAllByLabelText('Data source')).toHaveLength(2);
    expect(bridge.command).not.toHaveBeenCalled();
  });
  it.each(['ranking', 'final'] as const)(
    'allows label edits for an inherited %s screen without source data',
    async (view) => {
      state.sources = [];
      state.snapshots = [];
      state.local.screens[0]!.config = { ...screenConfig(), view, standby: true };
      render(<Operator />);
      fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
      fireEvent.change(screen.getByLabelText('Display label'), {
        target: { value: 'Retained final result' },
      });
      expect(screen.getByRole('button', { name: 'Apply to screen' })).toBeEnabled();
      expect(screen.queryByText(/Ranking and final standings require/)).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Follow'), { target: { value: 'athlete' } });
      expect(screen.getByRole('button', { name: 'Apply to screen' })).toBeDisabled();
      fireEvent.change(screen.getByLabelText('Follow'), { target: { value: 'lane' } });
      fireEvent.click(screen.getByRole('button', { name: view === 'ranking' ? 'Final' : 'Ranking' }));
      expect(screen.getByRole('button', { name: 'Apply to screen' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: view === 'ranking' ? 'Ranking' : 'Final' }));
      expect(screen.getByRole('button', { name: 'Apply to screen' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
      await waitFor(() =>
        expect(bridge.command).toHaveBeenCalledWith({
          type: 'apply',
          nodeId: 'display-one',
          config: {
            ...screenConfig(2),
            view,
            standby: true,
            selections: [{ ...screenConfig().selections[0]!, label: 'Retained final result' }],
          },
        }),
      );
    },
  );
  it.each([false, true])('keeps a later standby action after draft standby edits: %s', async (editStandby) => {
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Renamed stand' } });
    if (editStandby) {
      fireEvent.click(screen.getByLabelText('Show standby screen'));
      fireEvent.click(screen.getByLabelText('Show standby screen'));
    }
    expect(screen.getByLabelText('Show standby screen')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Standby' }));
    await waitFor(() => expect(screen.getByLabelText('Show standby screen')).toBeChecked());
    expect(screen.getByLabelText('Screen name')).toHaveValue('Renamed stand');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
    await waitFor(() =>
      expect(bridge.command).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'apply',
          config: expect.objectContaining({ name: 'Renamed stand', standby: true, revision: 3 }),
        }),
      ),
    );
  });
  it('requires explicit selection and pairing secret after discovering candidates', async () => {
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /Data sources/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Discover devices' }));
    await screen.findByLabelText('Discovered on this network');
    expect(bridge.command).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Discovered on this network'), {
      target: { value: 'http://192.168.1.3:4180' },
    });
    expect(screen.getByLabelText('Endpoint')).toHaveValue('http://192.168.1.3:4180');
    fireEvent.change(screen.getByLabelText('Pairing secret'), { target: { value: 'p'.repeat(32) } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect source' }));
    await waitFor(() =>
      expect(bridge.command).toHaveBeenCalledWith({
        type: 'connectSource',
        endpoint: 'http://192.168.1.3:4180',
        secret: 'p'.repeat(32),
      }),
    );
    await waitFor(() => expect(screen.getByLabelText('Pairing secret')).toHaveValue(''));
  });
  it('reports discovery results for the device type being paired, including after changing tabs', async () => {
    const devices = await bridge.discover();
    vi.mocked(bridge.discover).mockResolvedValue([
      ...devices,
      {
        ...devices[0]!,
        identity: { ...devices[0]!.identity, kind: 'display', sourceId: 'display-two', name: 'Hall PC' },
      },
      {
        ...devices[0]!,
        identity: { ...devices[0]!.identity, kind: 'display', sourceId: 'display-three', name: 'Lobby PC' },
      },
    ]);
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /Data sources/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Discover devices' }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 device found.');
    expect(screen.queryByRole('option', { name: /Hall PC/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Display PCs/ }));
    expect(screen.getByText('2 devices found. Choose a device below.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('option', { name: /Hall PC/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Lane two/ })).not.toBeInTheDocument();
    expect(bridge.command).not.toHaveBeenCalled();
  });
  it('inspects newly selected subjects before Apply so the operator can select participants', async () => {
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.click(screen.getByRole('button', { name: '+ Add source' }));
    fireEvent.change(screen.getAllByLabelText('Data source')[1]!, { target: { value: 'lane-one' } });
    await waitFor(() =>
      expect(bridge.command).toHaveBeenCalledWith({
        type: 'inspectSubject',
        sourceId: 'lane-one',
        subjectId: 'session-one',
      }),
    );
    expect(vi.mocked(bridge.command).mock.calls.every(([command]) => command.type !== 'apply')).toBe(true);
    expect(screen.getAllByLabelText(/Lane 1 ·/)).toHaveLength(2);
  });
  it('preserves failed drafts and makes a later Apply retry explicit', async () => {
    vi.mocked(bridge.command).mockRejectedValueOnce(new Error('Display PC unavailable'));
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Screen name'), { target: { value: 'Retry name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
    expect(await screen.findByText('Display PC unavailable')).toBeInTheDocument();
    expect(screen.getByLabelText('Screen name')).toHaveValue('Retry name');
    expect(screen.getByRole('button', { name: 'Apply to screen' })).toBeEnabled();
    expect(bridge.command).toHaveBeenCalledTimes(1);
  });
  it('shows paused acquisition, incomplete history, receipt time and errors separately from rendering', async () => {
    const entry = state.snapshots[0]!;
    entry.state = 'stale';
    entry.receivedAt = Date.UTC(2026, 8, 11, 8);
    entry.error = 'Source history request failed';
    entry.snapshot.participants[0]!.historyComplete = false;
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    const status = screen.getByRole('region', { name: 'Source data for requested settings' });
    expect(screen.getByText('Confirmed v1')).toBeInTheDocument();
    expect(screen.getByText('Sources connected')).toHaveTextContent('1 / 1');
    expect(within(status).getByText('Updates paused')).toBeInTheDocument();
    expect(within(status).getByText(/Partial history/)).toBeInTheDocument();
    expect(within(status).getByText(entry.error)).toBeInTheDocument();
    expect(within(status).getByText(/Last received on this PC:/)).toBeInTheDocument();
    expect(status.querySelector('time')).toHaveAttribute('datetime', new Date(entry.receivedAt).toISOString());
  });
  it('identifies an affected Director participant while other participants continue updating', async () => {
    state.sources[0]!.catalog!.identity.kind = 'director';
    const entry = state.snapshots[0]!;
    entry.snapshot.participants.push({
      ...structuredClone(entry.snapshot.participants[0]!),
      id: 'athlete-two',
      laneId: 'lane-two',
      laneName: 'Lane 2',
      name: 'Affected athlete',
      dataState: 'stale',
      historyComplete: false,
    });
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    const status = screen.getByRole('region', { name: 'Source data for requested settings' });
    expect(within(status).getByText('Live')).toBeInTheDocument();
    expect(within(status).getByText('Live').closest('.status-pill')).not.toHaveClass('good');
    expect(within(status).getByText('Lane 2 · Affected athlete: Updates paused · Partial history')).toBeInTheDocument();
    expect(within(status).getAllByRole('listitem')).toHaveLength(1);
  });
  it('keeps acquisition status bound to the saved request while a different subject is only a draft', async () => {
    state.snapshots[0]!.state = 'stale';
    const next = snapshot();
    next.subjectId = 'session-two';
    next.label = 'Next relay';
    state.snapshots.push({ snapshot: next, state: 'live', receivedAt: Date.now(), error: null });
    state.sources[0]!.catalog!.subjects.push({
      ...state.sources[0]!.catalog!.subjects[0]!,
      id: next.subjectId,
      label: next.label,
    });
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    fireEvent.change(screen.getByLabelText('Competition / session'), { target: { value: next.subjectId } });
    await waitFor(() =>
      expect(bridge.command).toHaveBeenCalledWith(expect.objectContaining({ type: 'inspectSubject' })),
    );
    const status = screen.getByRole('region', { name: 'Source data for requested settings' });
    expect(within(status).getByText('Updates paused')).toBeInTheDocument();
    expect(within(status).queryByText(/Next relay/)).not.toBeInTheDocument();
    expect(screen.getByText('Unapplied changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
    await within(status).findByText(/Next relay/);
    expect(within(status).getByText(/Next relay/)).toBeInTheDocument();
    expect(within(status).getByText('Live')).toBeInTheDocument();
    expect(within(status).queryByText('Updates paused')).not.toBeInTheDocument();
  });
  it('shows missing receipts without presenting a pending remote request as an applied screen', async () => {
    state.snapshots = [];
    state.peers.push({
      id: 'remote-pc',
      endpoint: 'http://192.168.1.3:4180',
      error: null,
      node: {
        ...structuredClone(state.local),
        identity: { ...state.local.identity, sourceId: 'remote-pc', name: 'Remote PC' },
        screens: [{ ...state.local.screens[0]!, config: { ...screenConfig(2), name: 'Remote stand' } }],
      },
    });
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /Remote stand/ }));
    const status = screen.getByRole('region', { name: 'Source data for requested settings' });
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(within(status).getByText('Waiting for data')).toBeInTheDocument();
    expect(within(status).getByText('Last received on this PC: Never')).toBeInTheDocument();
    expect(screen.getByText('Last v1 · unconfirmed')).toBeInTheDocument();
    expect(screen.queryByText('Confirmed v2')).not.toBeInTheDocument();
  });
  it.each(['targets', 'focus', 'ranking', 'final'] as const)(
    'can select a later fixed page on an inherited remote %s screen without a local snapshot',
    async (view) => {
      state.sources = [];
      state.snapshots = [];
      const remote = {
        ...structuredClone(state.local),
        identity: { ...state.local.identity, sourceId: 'remote-pc', name: 'Remote PC' },
        controllerId: state.local.identity.sourceId,
        resumableSubjects: [{ sourceId: 'lane-one', subjectId: 'session-one' }],
        screens: [
          {
            ...state.local.screens[0]!,
            config: { ...screenConfig(), view, autoRotate: false, name: 'Remote stand' },
          },
        ],
      };
      state.local.screens = [];
      state.peers = [{ id: 'remote-pc', endpoint: 'http://192.168.1.3:4180', node: remote, error: null }];
      vi.mocked(bridge.command).mockImplementation(async (command) => {
        if (command.type === 'apply') remote.screens[0]!.config = command.config;
      });
      render(<Operator />);
      fireEvent.click(await screen.findByRole('button', { name: /Remote stand/ }));
      const startingPage = screen.getByLabelText('Starting page');
      fireEvent.change(startingPage, { target: { value: '3' } });
      expect(startingPage).toHaveValue(3);
      expect(screen.getByText(/Position and page counts are unavailable on this PC/)).toBeInTheDocument();
      expect(startingPage).not.toHaveAttribute('max');
      fireEvent.change(startingPage, { target: { value: '2.5' } });
      expect(startingPage).toHaveValue(3);
      fireEvent.change(startingPage, { target: { value: '1e20' } });
      expect(startingPage).toHaveValue(3);
      fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
      await waitFor(() =>
        expect(bridge.command).toHaveBeenCalledWith({
          type: 'apply',
          nodeId: 'remote-pc',
          config: { ...screenConfig(2), view, autoRotate: false, name: 'Remote stand', page: 2 },
        }),
      );
    },
  );
  it('keeps page counts unknown when only some selected subjects have local snapshots', async () => {
    state.local.screens[0]!.config.selections.push({
      ...screenConfig().selections[0]!,
      subjectId: 'remote-only-subject',
    });
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    expect(screen.getByText(/Position and page counts are unavailable on this PC/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Starting page'), { target: { value: '4' } });
    expect(screen.getByLabelText('Starting page')).toHaveValue(4);
  });
  it('uses fixed selections to count target pages even without local snapshots', async () => {
    state.snapshots = [];
    state.local.screens[0]!.config.selections[0]!.participantIds = Array.from(
      { length: 9 },
      (_, index) => `lane-${index + 1}`,
    );
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    expect(screen.getByText(/9 selected positions · 3 pages/)).toBeInTheDocument();
    expect(screen.getByLabelText('Starting page')).toHaveAttribute('max', '3');
    fireEvent.change(screen.getByLabelText('Starting page'), { target: { value: '4' } });
    expect(screen.getByLabelText('Starting page')).toHaveValue(3);
  });
  it('applies a valid fractional page duration without changing integer field constraints', async () => {
    render(<Operator />);
    fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
    const duration = screen.getByLabelText<HTMLInputElement>('Seconds per page');
    fireEvent.change(duration, { target: { value: '1.5' } });
    expect(duration).toHaveValue(1.5);
    expect(duration.validity.stepMismatch).toBe(false);
    expect(duration.form?.checkValidity()).toBe(true);
    for (const label of ['Targets per page', 'Starting page', 'Recent shot count'])
      expect(screen.getByLabelText(label)).toHaveAttribute('step', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Apply to screen' }));
    await waitFor(() =>
      expect(bridge.command).toHaveBeenCalledWith({
        type: 'apply',
        nodeId: 'display-one',
        config: { ...screenConfig(2), pageSeconds: 1.5 },
      }),
    );
    expect(state.local.screens[0]!.config.pageSeconds).toBe(1.5);
  });
  it.each([false, true])(
    'distinguishes unavailable ranking rows from a confirmed empty ranking: %s',
    async (available) => {
      state.sources[0]!.catalog!.identity.kind = 'director';
      state.local.screens[0]!.config.view = 'ranking';
      state.local.screens[0]!.config.selections[0]!.participantIds = ['athlete-one'];
      state.snapshots[0]!.snapshot.ranking = available
        ? { scope: 'Competition', kind: 'competition', revision: '1', state: 'DRAFT', rows: [] }
        : null;
      render(<Operator />);
      fireEvent.click(await screen.findByRole('button', { name: /North stand/ }));
      expect(
        screen.getByText(
          available ? /0 selected positions · 1 page/ : /Position and page counts are unavailable on this PC/,
        ),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Starting page').getAttribute('max')).toBe(available ? '1' : null);
    },
  );
});
