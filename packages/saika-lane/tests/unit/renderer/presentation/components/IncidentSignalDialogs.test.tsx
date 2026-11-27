// SPDX-License-Identifier: MIT
/** Behaviour the Range Officer, possible-malfunction and EST complaint dialogs share, and where they differ. */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EstComplaintSignalControl } from '@/renderer/presentation/components/EstComplaintSignalControl';
import type { IncidentReportDialogProps } from '@/renderer/presentation/components/IncidentReportDialogProps';
import { QualificationMalfunctionSignalControl } from '@/renderer/presentation/components/QualificationMalfunctionSignalControl';
import { RangeOfficerRequestControl } from '@/renderer/presentation/components/RangeOfficerRequestControl';

const mqtt = vi.hoisted(() => ({
  getMqttStatus: vi.fn(),
  getRangeOfficerRequest: vi.fn(),
  requestRangeOfficer: vi.fn(),
  clearRangeOfficerRequest: vi.fn(),
  getQualificationMalfunctionSignal: vi.fn(),
  declareQualificationMalfunction: vi.fn(),
  clearQualificationMalfunctionSignal: vi.fn(),
  getEstComplaintSignal: vi.fn(),
  getEstComplaintContext: vi.fn(),
  declareEstComplaint: vi.fn(),
  clearEstComplaintSignal: vi.fn(),
}));

vi.mock('@/renderer/services/mqttService', () => ({ mqttService: mqtt }));

const base = {
  schemaVersion: 1 as const,
  laneId: '11111111-1111-4111-8111-111111111111',
  message: null,
  clearedAt: null,
  clearedBy: null,
  publishedAt: '2026-09-04T00:00:00.000Z',
};
const context = {
  competitionId: '33333333-3333-4333-8333-333333333333',
  sessionId: '44444444-4444-4444-8444-444444444444',
  participantId: 'participant-12',
  participantName: 'Test Athlete',
  startNumber: '12',
  phase: 'MATCH' as const,
  stageIndex: 1,
  seriesIndex: 2,
  seriesShotLimit: 5,
  recordedShots: 3,
  timedTargetProgramId: null,
  exposureIndex: null,
};
const signalId = '22222222-2222-4222-8222-222222222222';

interface DialogCase {
  name: string;
  Dialog: ComponentType<IncidentReportDialogProps>;
  get: keyof typeof mqtt;
  declare: keyof typeof mqtt;
  clear: keyof typeof mqtt;
  idle: object;
  active: object;
  textarea: string;
  declareButton: string;
  declaring: string;
  clearButton: RegExp;
  clearInput: object;
  /** Declare input for the observation `  Jammed slide  `, and for a blank one. */
  declareInputs: [object, object];
}

const cases: DialogCase[] = [
  {
    name: 'Range Officer request',
    Dialog: RangeOfficerRequestControl,
    get: 'getRangeOfficerRequest',
    declare: 'requestRangeOfficer',
    clear: 'clearRangeOfficerRequest',
    idle: { ...base, status: 'CLEARED', requestId: null, category: null, requestedAt: null },
    active: {
      ...base,
      status: 'ACTIVE',
      requestId: signalId,
      category: 'EQUIPMENT',
      requestedAt: '2026-09-04T00:00:00.000Z',
    },
    textarea: 'Details (optional)',
    declareButton: 'Call Range Officer',
    declaring: 'Requesting…',
    clearButton: /Clear request/,
    clearInput: { requestId: signalId },
    declareInputs: [{ category: 'ASSISTANCE', message: '  Jammed slide  ' }, { category: 'ASSISTANCE' }],
  },
  {
    name: 'possible malfunction',
    Dialog: QualificationMalfunctionSignalControl,
    get: 'getQualificationMalfunctionSignal',
    declare: 'declareQualificationMalfunction',
    clear: 'clearQualificationMalfunctionSignal',
    idle: { ...base, status: 'CLEARED', signalId: null, context: null, signalledAt: null },
    active: { ...base, status: 'ACTIVE', signalId, context, signalledAt: '2026-09-04T00:00:00.000Z' },
    textarea: 'Observation (optional)',
    declareButton: 'Declare possible malfunction',
    declaring: 'Declaring…',
    clearButton: /Clear after official acknowledgement/,
    clearInput: { signalId },
    declareInputs: [{ message: 'Jammed slide' }, {}],
  },
  {
    name: 'EST complaint',
    Dialog: EstComplaintSignalControl,
    get: 'getEstComplaintSignal',
    declare: 'declareEstComplaint',
    clear: 'clearEstComplaintSignal',
    idle: { ...base, status: 'CLEARED', signalId: null, issue: null, context: null, signalledAt: null },
    active: {
      ...base,
      status: 'ACTIVE',
      signalId,
      issue: 'TARGET_FAILURE',
      context: { ...context, lastShot: null },
      signalledAt: '2026-09-04T00:00:00.000Z',
    },
    textarea: 'Observation (optional)',
    declareButton: 'Raise EST complaint',
    declaring: 'Raising…',
    clearButton: /Clear after official acknowledgement/,
    clearInput: { signalId },
    declareInputs: [{ issue: 'SHOT_VALUE', message: 'Jammed slide' }, { issue: 'SHOT_VALUE' }],
  },
];

const stored = 'Stored on this Lane. It will be published automatically after MQTT reconnects.';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function errorParagraph(text: string): HTMLElement {
  const element = screen.getByText(text);
  expect(element.tagName).toBe('P');
  expect(element.className).toBe('mt-4 text-sm text-red-400');
  return element;
}

describe.each(cases)('$name dialog', (dialog) => {
  const { Dialog } = dialog;

  beforeEach(() => {
    vi.clearAllMocks();
    mqtt.getMqttStatus.mockResolvedValue({ status: 'connected' });
    mqtt.getEstComplaintContext.mockRejectedValue(new Error('no preview'));
    mqtt[dialog.get].mockResolvedValue(dialog.idle);
    mqtt[dialog.declare].mockResolvedValue(dialog.active);
    mqtt[dialog.clear].mockResolvedValue(dialog.idle);
  });

  it('reads the signal and the MQTT status on mount and each time it opens', async () => {
    const props = { onClose: vi.fn(), onActiveChange: vi.fn() };
    const { rerender } = render(<Dialog isOpen={false} {...props} />);
    await waitFor(() => expect(mqtt[dialog.get]).toHaveBeenCalledTimes(1));
    expect(mqtt.getMqttStatus).toHaveBeenCalledTimes(1);

    rerender(<Dialog isOpen {...props} />);
    await waitFor(() => expect(mqtt[dialog.get]).toHaveBeenCalledTimes(2));
    rerender(<Dialog isOpen={false} {...props} />);
    rerender(<Dialog isOpen {...props} />);

    await waitFor(() => expect(mqtt[dialog.get]).toHaveBeenCalledTimes(3));
    expect(mqtt.getMqttStatus).toHaveBeenCalledTimes(3);
  });

  it('reads once when it mounts already open', async () => {
    render(<Dialog isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledOnce());
    await act(async () => {});

    expect(mqtt[dialog.get]).toHaveBeenCalledOnce();
    expect(mqtt.getMqttStatus).toHaveBeenCalledOnce();
  });

  it('keeps a declaration that completes while an older read is still pending', async () => {
    const props = { onClose: vi.fn(), onActiveChange: vi.fn() };
    const { rerender } = render(<Dialog isOpen={false} {...props} />);
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledOnce());
    const staleRead = deferred<object>();
    mqtt[dialog.get].mockReturnValueOnce(staleRead.promise);
    rerender(<Dialog isOpen {...props} />);
    await waitFor(() => expect(mqtt[dialog.get]).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: dialog.declareButton }));
    expect(await screen.findByRole('button', { name: dialog.clearButton })).toBeEnabled();
    await act(async () => staleRead.resolve(dialog.idle));

    expect(screen.getByRole('button', { name: dialog.clearButton })).toBeEnabled();
    expect(props.onActiveChange).toHaveBeenLastCalledWith(true);
  });

  it('reports whether the signal is active', async () => {
    mqtt[dialog.get].mockResolvedValue(dialog.active);
    const onActiveChange = vi.fn();

    render(<Dialog isOpen={false} onClose={vi.fn()} onActiveChange={onActiveChange} />);

    expect(onActiveChange).toHaveBeenNthCalledWith(1, false);
    await waitFor(() => expect(onActiveChange).toHaveBeenLastCalledWith(true));
  });

  it('shows the stored-on-Lane notice for an active signal only while MQTT is disconnected', async () => {
    mqtt[dialog.get].mockResolvedValue(dialog.active);
    mqtt.getMqttStatus.mockResolvedValue({ status: 'disconnected' });
    const { unmount } = render(<Dialog isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);

    expect(await screen.findByText(stored)).toHaveClass('text-sm text-amber-300');
    unmount();

    mqtt.getMqttStatus.mockResolvedValue({ status: 'connected' });
    render(<Dialog isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: dialog.clearButton })).toBeInTheDocument();
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(stored)).not.toBeInTheDocument();
  });

  it('shows a failed read until a later read succeeds', async () => {
    const props = { onClose: vi.fn(), onActiveChange: vi.fn() };
    const { rerender } = render(<Dialog isOpen={false} {...props} />);
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledTimes(1));
    mqtt[dialog.get].mockRejectedValueOnce(new Error('Signal store unavailable'));

    rerender(<Dialog isOpen {...props} />);
    await waitFor(() => errorParagraph('Signal store unavailable'));
    rerender(<Dialog isOpen={false} {...props} />);
    rerender(<Dialog isOpen {...props} />);

    await waitFor(() => expect(screen.queryByText('Signal store unavailable')).not.toBeInTheDocument());
  });

  it('shows the busy label while declaring, then the active signal and a fresh MQTT status', async () => {
    const pending = deferred<object>();
    mqtt[dialog.declare].mockReturnValue(pending.promise);
    render(<Dialog isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: dialog.declareButton }));

    const busy = await screen.findByRole('button', { name: dialog.declaring });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    pending.resolve(dialog.active);
    expect(await screen.findByRole('button', { name: dialog.clearButton })).toBeEnabled();
    expect(mqtt.getMqttStatus).toHaveBeenCalledTimes(2);
  });

  it('shows a failed declaration and enables the form again', async () => {
    mqtt[dialog.declare].mockRejectedValue(new Error('Lane is not ready'));
    render(<Dialog isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: dialog.declareButton }));

    await waitFor(() => errorParagraph('Lane is not ready'));
    expect(screen.getByRole('button', { name: dialog.declareButton })).toBeEnabled();
    expect(mqtt.getMqttStatus).toHaveBeenCalledOnce();
  });

  it('sends the observation the way this dialog normalizes it', async () => {
    render(<Dialog isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledOnce());
    mqtt[dialog.declare].mockRejectedValue(new Error('Lane is not ready'));

    fireEvent.change(screen.getByLabelText(dialog.textarea), { target: { value: '  Jammed slide  ' } });
    fireEvent.click(screen.getByRole('button', { name: dialog.declareButton }));
    await waitFor(() => expect(mqtt[dialog.declare]).toHaveBeenLastCalledWith(dialog.declareInputs[0]));
    await waitFor(() => expect(screen.getByRole('button', { name: dialog.declareButton })).toBeEnabled());

    fireEvent.change(screen.getByLabelText(dialog.textarea), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: dialog.declareButton }));
    await waitFor(() => expect(mqtt[dialog.declare]).toHaveBeenLastCalledWith(dialog.declareInputs[1]));
  });

  it('clears by signal identity, shows a failed clear and empties the draft afterwards', async () => {
    render(<Dialog isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);
    await waitFor(() => expect(mqtt.getMqttStatus).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText(dialog.textarea), { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: dialog.declareButton }));
    const clearButton = await screen.findByRole('button', { name: dialog.clearButton });
    mqtt[dialog.clear].mockRejectedValueOnce(new Error('Clear rejected'));

    fireEvent.click(clearButton);
    await waitFor(() => errorParagraph('Clear rejected'));
    fireEvent.click(screen.getByRole('button', { name: dialog.clearButton }));

    expect(await screen.findByLabelText(dialog.textarea)).toHaveValue('');
    expect(mqtt[dialog.clear]).toHaveBeenCalledTimes(2);
    expect(mqtt[dialog.clear]).toHaveBeenLastCalledWith(dialog.clearInput);
    expect(screen.queryByText('Clear rejected')).not.toBeInTheDocument();
  });
});

describe('captured athlete snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mqtt.getMqttStatus.mockResolvedValue({ status: 'connected' });
  });

  it('lists athlete, position, shots and exposure for a possible malfunction', async () => {
    mqtt.getQualificationMalfunctionSignal.mockResolvedValue({
      ...cases[1]!.active,
      context: { ...context, exposureIndex: 2, startNumber: null },
    });

    const { container } = render(
      <QualificationMalfunctionSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />,
    );

    await screen.findByText('Official attention requested');
    const list = container.ownerDocument.querySelector('dl')!;
    expect(list.className).toBe('mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-200');
    expect([...list.children].map((item) => `${item.tagName}:${item.textContent}`)).toEqual([
      'DT:Athlete',
      'DD:Test Athlete',
      'DT:Position',
      'DD:MATCH, stage 2, series 3',
      'DT:Shots recorded',
      'DD:3 / 5',
      'DT:Exposure',
      'DD:3',
    ]);
  });

  it('adds the last recorded shot before the exposure for an EST complaint', async () => {
    const receivedAt = '2026-09-04T00:00:00.100Z';
    mqtt.getEstComplaintSignal.mockResolvedValue({
      ...cases[2]!.active,
      context: {
        ...context,
        seriesShotLimit: null,
        exposureIndex: 0,
        lastShot: { shotId: 'shot-1', shotNumberInSeries: 3, firedAt: receivedAt, receivedAt },
      },
    });

    const { container } = render(<EstComplaintSignalControl isOpen onClose={vi.fn()} onActiveChange={vi.fn()} />);

    await screen.findByText('Target failure');
    const list = container.ownerDocument.querySelector('dl')!;
    expect([...list.children].map((item) => `${item.tagName}:${item.textContent}`)).toEqual([
      'DT:Athlete',
      'DD:#12 Test Athlete',
      'DT:Position',
      'DD:MATCH, stage 2, series 3',
      'DT:Shots recorded',
      'DD:3',
      'DT:Last recorded shot',
      `DD:#3 at ${new Date(receivedAt).toLocaleTimeString()}`,
      'DT:Exposure',
      'DD:1',
    ]);
    expect([...list.querySelectorAll('dt')].every((term) => term.className === 'text-zinc-400')).toBe(true);
  });
});
