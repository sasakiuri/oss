import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtestCaseDto } from '@/shared/ipc/contracts';

import { ProtestsPanel } from '@/renderer/presentation/features/protests/ProtestsPanel';

import { APPEAL_ID, PROTEST_ID, protestFixture } from '../../../../../helpers/protestFixture';

const { list, create, recordEntry, openProtestPrint } = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  recordEntry: vi.fn(),
  openProtestPrint: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  protestsService: { list, create, recordEntry },
  boardService: { openProtestPrint },
}));

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
async function openWrittenForm() {
  render(<ProtestsPanel scopeId="event-a" />);
  await waitFor(() => expect(list).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
  fill('Type', 'WRITTEN');
  fill('Lodged by', 'Team official');
  fill('Receiving official', 'Range official');
  fill('Subject', 'Interruption decision');
  fill('Statement', 'Review requested');
}

describe('ProtestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ success: true, data: [] });
    create.mockResolvedValue({ success: true, data: protestFixture() });
  });

  it('records the actual fee and original receipt time for a late paper filing', async () => {
    await openWrittenForm();
    fill(/Received at/, '2026-09-08T09:45:12');
    fill(/Decision \/ action time/, '2026-09-08T09:00:03');
    fill(/Fee received/, '20');
    fill('Form P reference', 'P-42');
    fill(/Late acceptance explanation/, 'Paper record entered after the relay');
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          feePaidEuro: 20,
          lodgedAt: new Date('2026-09-08T09:45:12').toISOString(),
          triggeringDecisionAt: new Date('2026-09-08T09:00:03').toISOString(),
          lateAcceptanceReason: 'Paper record entered after the relay',
          formReference: 'P-42',
        }),
      ),
    );
  });

  it('preserves unknown fees and missing form references instead of asserting payment', async () => {
    await openWrittenForm();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          feePaidEuro: null,
          formReference: null,
          triggeringDecisionAt: null,
        }),
      ),
    );
  });

  it('keeps the entered statement after a failed save and prevents repeated submissions while waiting', async () => {
    let complete!: (value: unknown) => void;
    create.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    await openWrittenForm();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    expect(create).toHaveBeenCalledTimes(1);
    complete({ success: false, error: { message: 'Receipt could not be saved' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Receipt could not be saved');
    expect(screen.getByLabelText('Statement')).toHaveValue('Review requested');
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });

  it('opens the selected record for printing and retains a failed historical decision for retry', async () => {
    list.mockResolvedValue({ success: true, data: [protestFixture()] });
    recordEntry.mockRejectedValue(new Error('Connection lost'));
    openProtestPrint.mockResolvedValue({ success: true, data: 'window-1' });
    render(<ProtestsPanel scopeId="event-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print operational copy' }));
    await waitFor(() => expect(openProtestPrint).toHaveBeenCalledWith({ protestId: PROTEST_ID }));
    fill('Official', 'Jury chair');
    fill('Decision / note', 'Decision communicated on paper');
    fill('Rule reference', '6.16.6');
    fill(/Action time/, '2026-09-08T09:30:21');
    fireEvent.click(screen.getByRole('button', { name: 'Append action' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: PROTEST_ID,
        ruleReference: '6.16.6',
        occurredAt: new Date('2026-09-08T09:30:21').toISOString(),
      }),
    );
    expect(screen.getByLabelText('Decision / note')).toHaveValue('Decision communicated on paper');
  });
});

const OLDER_ID = '33333333-3333-4333-8333-333333333333';
const ROW_CLASS = 'block w-full border-b border-vscode-border p-3 text-left text-xs';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const older = () => protestFixture({ id: OLDER_ID, subject: 'Older protest', kind: 'VERBAL', status: 'DECIDED' });
const banner = () => document.querySelector('p.border-l-2.border-vscode-error');

describe('ProtestsPanel records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    list.mockResolvedValue({ success: true, data: [older(), protestFixture()] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists the event records newest first and selects the newest one', async () => {
    render(<ProtestsPanel scopeId="event-a" />);

    expect(await screen.findByRole('heading', { name: 'Interruption decision' })).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith({ scopeType: 'EVENT', scopeId: 'event-a' });
    const rows = within(screen.getByRole('complementary')).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Interruption decisionWRITTEN · OPEN',
      'Older protestVERBAL · DECIDED',
    ]);
    expect(rows[0]).toHaveAttribute('class', `${ROW_CLASS} bg-vscode-highlight`);
    expect(rows[1]).toHaveAttribute('class', `${ROW_CLASS} `);
    expect(screen.queryByText('No protest records.')).not.toBeInTheDocument();
  });

  it('keeps the selected record when the list reloads', async () => {
    render(<ProtestsPanel scopeId="event-a" />);
    fireEvent.click(await screen.findByRole('button', { name: /^Older protest/ }));
    expect(screen.getByRole('heading', { name: 'Older protest' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));

    expect(screen.getByRole('heading', { name: 'Older protest' })).toBeInTheDocument();
  });

  it('shows the empty text while the first list is loading', async () => {
    const pending = deferred<{ success: true; data: ProtestCaseDto[] }>();
    list.mockReturnValueOnce(pending.promise);
    render(<ProtestsPanel scopeId="event-a" />);

    expect(screen.getByText('No protest records.')).toHaveClass('p-3 text-xs text-vscode-text-muted');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    await act(async () => pending.resolve({ success: true, data: [] }));
    expect(screen.getByText('No protest records.')).toBeInTheDocument();
  });

  it('keeps the newest list when an older request finishes last', async () => {
    const first = deferred<{ success: true; data: ProtestCaseDto[] }>();
    list.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ success: true, data: [older()] });
    render(<ProtestsPanel scopeId="event-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('heading', { name: 'Older protest' })).toBeInTheDocument();

    await act(async () => first.resolve({ success: true, data: [protestFixture()] }));

    expect(screen.getByRole('heading', { name: 'Older protest' })).toBeInTheDocument();
    expect(screen.queryByText('Interruption decision')).not.toBeInTheDocument();
  });

  it.each([
    [
      'a failed response',
      () => list.mockResolvedValue({ success: false, data: null, error: { code: 'X', message: 'Ledger unavailable' } }),
      'Ledger unavailable',
    ],
    ['a rejected non-error value', () => list.mockRejectedValue('bridge closed'), 'Failed to load protest records'],
  ])('shows %s of the list in the panel alert', async (_name, failQuery, message) => {
    failQuery();
    render(<ProtestsPanel scopeId="event-a" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(`^${message}$`));
    expect(banner()).toHaveAttribute('class', 'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error');
  });

  it.each([
    [
      'a failed response',
      () =>
        openProtestPrint.mockResolvedValue({ success: false, error: { code: 'X', message: 'Print window blocked' } }),
      'Print window blocked',
    ],
    [
      'a rejected non-error value',
      () => openProtestPrint.mockRejectedValue('bridge closed'),
      'Failed to open the protest print preview',
    ],
  ])('shows %s of the print preview in the panel alert', async (_name, failPrint, message) => {
    failPrint();
    render(<ProtestsPanel scopeId="event-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print operational copy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(new RegExp(`^${message}$`));
    expect(banner()).not.toBeNull();
  });

  it('clears a print error when the list reloads', async () => {
    openProtestPrint.mockResolvedValue({ success: false, error: { code: 'X', message: 'Print window blocked' } });
    render(<ProtestsPanel scopeId="event-a" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Print operational copy' }));
    await screen.findByRole('alert');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('closes the lodging form after saving, selects the new record and reloads the list', async () => {
    const appeal = protestFixture({ id: APPEAL_ID, subject: 'Appeal against the decision', kind: 'APPEAL' });
    create.mockResolvedValue({ success: true, data: appeal });
    render(<ProtestsPanel scopeId="event-a" />);
    await screen.findByRole('heading', { name: 'Interruption decision' });
    fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
    fill('Type', 'APPEAL');
    const parents = screen.getByLabelText('Parent protest') as HTMLSelectElement;
    expect([...parents.options].map((option) => option.textContent)).toEqual([
      'Select',
      'Older protest',
      'Interruption decision',
    ]);
    fill('Parent protest', PROTEST_ID);
    fill('Lodged by', 'Team official');
    fill('Receiving official', 'Range official');
    fill('Subject', 'Appeal against the decision');
    fill('Statement', 'Appeal requested');
    list.mockResolvedValue({ success: true, data: [older(), protestFixture(), appeal] });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));

    expect(await screen.findByRole('heading', { name: 'Appeal against the decision' })).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'APPEAL', parentProtestId: PROTEST_ID }));
    expect(screen.queryByRole('heading', { name: 'Lodge protest or appeal' })).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('offers only appealable, non-void protests as appeal parents', async () => {
    list.mockResolvedValue({
      success: true,
      data: [
        protestFixture(),
        protestFixture({ id: OLDER_ID, subject: 'Void protest', status: 'VOID' }),
        protestFixture({
          id: '44444444-4444-4444-8444-444444444444',
          subject: 'Expired protest',
          compliance: { ...protestFixture().compliance, appealPermitted: false },
        }),
      ],
    });
    render(<ProtestsPanel scopeId="event-a" />);
    await screen.findByRole('heading', { name: 'Expired protest' });
    fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
    fill('Type', 'APPEAL');

    const parents = screen.getByLabelText('Parent protest') as HTMLSelectElement;
    expect([...parents.options].map((option) => option.textContent)).toEqual(['Select', 'Interruption decision']);
  });

  it('shows the lodging fallback text for a rejected non-error value and discards the draft on cancel', async () => {
    create.mockRejectedValue('bridge closed');
    await openWrittenForm();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Failed to record the protest$/);
    expect(alert).toHaveAttribute('class', 'text-xs text-vscode-error');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lodge' }));
    expect(screen.getByLabelText('Statement')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('records an action, clears the note, resets the time and reloads the list', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-08T09:00:07.000Z'));
    recordEntry.mockResolvedValue({ success: true, data: protestFixture() });
    render(<ProtestsPanel scopeId="event-a" />);
    await screen.findByRole('heading', { name: 'Interruption decision' });
    const initialTime = (screen.getByLabelText(/Action time/) as HTMLInputElement).value;
    expect(new Date(initialTime).toISOString()).toBe('2026-09-08T09:00:07.000Z');
    fill('Action', 'FORWARDED_TO_JURY');
    fill('Official', 'Jury chair');
    fill('Decision / note', 'Forwarded to the Jury');
    fill(/Action time/, '2026-09-08T09:30:21');
    vi.setSystemTime(new Date('2026-09-08T10:00:05.000Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Append action' }));

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(recordEntry).toHaveBeenCalledWith({
      caseId: PROTEST_ID,
      type: 'FORWARDED_TO_JURY',
      statement: 'Forwarded to the Jury',
      officialName: 'Jury chair',
      occurredAt: new Date('2026-09-08T09:30:21').toISOString(),
      ruleReference: null,
    });
    await waitFor(() => expect(screen.getByLabelText('Decision / note')).toHaveValue(''));
    expect(new Date((screen.getByLabelText(/Action time/) as HTMLInputElement).value).toISOString()).toBe(
      '2026-09-08T10:00:05.000Z',
    );
    expect(screen.getByLabelText('Official')).toHaveValue('Jury chair');
    expect(screen.getByLabelText('Action')).toHaveValue('FORWARDED_TO_JURY');
  });

  it.each([
    [
      'a failed response',
      () => recordEntry.mockResolvedValue({ success: false, error: { code: 'X', message: 'Case is closed' } }),
      'Case is closed',
    ],
    ['a rejected non-error value', () => recordEntry.mockRejectedValue('bridge closed'), 'Failed to record the action'],
  ])('shows %s of an action in the action form', async (_name, failCommand, message) => {
    failCommand();
    render(<ProtestsPanel scopeId="event-a" />);
    await screen.findByRole('heading', { name: 'Interruption decision' });
    fill('Official', 'Jury chair');
    fill('Decision / note', 'Decision communicated');
    fireEvent.click(screen.getByRole('button', { name: 'Append action' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(new RegExp(`^${message}$`));
    expect(alert).toHaveAttribute('class', 'text-xs text-vscode-error');
    expect(screen.getByLabelText('Decision / note')).toHaveValue('Decision communicated');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('discards the action draft when another record is selected', async () => {
    render(<ProtestsPanel scopeId="event-a" />);
    await screen.findByRole('heading', { name: 'Interruption decision' });
    fill('Decision / note', 'Draft for the newest record');

    fireEvent.click(screen.getByRole('button', { name: /^Older protest/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Interruption decision/ }));

    expect(screen.getByLabelText('Decision / note')).toHaveValue('');
  });

  it.each(['CLOSED', 'VOID'] as const)('offers no action form on a %s record', async (status) => {
    list.mockResolvedValue({ success: true, data: [protestFixture({ status })] });
    render(<ProtestsPanel scopeId="event-a" />);
    await screen.findByRole('heading', { name: 'Interruption decision' });

    expect(screen.queryByRole('button', { name: 'Append action' })).not.toBeInTheDocument();
  });
});
