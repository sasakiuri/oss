import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsBookPanel } from '@/renderer/presentation/features/results-books/ResultsBookPanel';
import type { ResultsBookWorkspaceDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const {
  getWorkspace,
  signBook,
  getSigningAccounts,
  appointOfficial,
  revokeOfficial,
  createRecordClaim,
  appendRecordClaimEntry,
  generateBook,
  finalizeBook,
  exportBook,
} = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  signBook: vi.fn(),
  getSigningAccounts: vi.fn(),
  appointOfficial: vi.fn(),
  revokeOfficial: vi.fn(),
  createRecordClaim: vi.fn(),
  appendRecordClaimEntry: vi.fn(),
  generateBook: vi.fn(),
  finalizeBook: vi.fn(),
  exportBook: vi.fn(),
}));
vi.mock('@/renderer/services', () => ({
  resultsBooksService: {
    getWorkspace,
    signBook,
    appointOfficial,
    revokeOfficial,
    createRecordClaim,
    appendRecordClaimEntry,
    generateBook,
    finalizeBook,
    exportBook,
  },
  operatorAccessService: { getSigningAccounts },
}));

describe('ResultsBookPanel signing', () => {
  it('requires external evidence and displays the separate recorder returned by the service', async () => {
    const signer = { appointmentId: 'appointment', role: 'TECHNICAL_DELEGATE' as const, officialName: 'Delegate' };
    const workspace: ResultsBookWorkspaceDto = {
      officials: [],
      eligibleRecordResults: [],
      recordClaims: [],
      books: [
        {
          id: 'book',
          championshipId: 'championship',
          versionNumber: 1,
          sourceHash: 'a'.repeat(64),
          findings: [],
          requiredSigners: [signer],
          signatures: [],
          createdBy: 'Recorder',
          createdAt: '2026-09-08T12:00:00Z',
          status: 'DRAFT',
          finalizedAt: null,
        },
      ],
    };
    getWorkspace.mockResolvedValue({ success: true, data: workspace });
    getSigningAccounts.mockResolvedValue({ success: true, data: [] });
    signBook.mockImplementation(async () => ({
      success: true,
      data: {
        ...workspace,
        books: [
          {
            ...workspace.books[0],
            signatures: [
              {
                ...signer,
                id: 'signature',
                statement: 'Checked',
                signedAt: '2026-09-08T12:00:00Z',
                signingEvidence: {
                  method: 'EXTERNAL',
                  actorId: null,
                  recordedBy: 'Recorder',
                  evidenceReference: 'Signed form 5',
                },
              },
            ],
          },
        ],
      },
    }));
    render(<ResultsBookPanel championshipId="championship" />);
    await screen.findByRole('button', { name: 'Sign' });
    fireEvent.change(screen.getByLabelText('Signature method'), { target: { value: 'EXTERNAL' } });
    expect(screen.getByRole('button', { name: 'Record signature' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Signed document / evidence reference'), {
      target: { value: 'Signed form 5' },
    });
    fireEvent.change(screen.getByLabelText('Recorded by (uses signed-in operator when available)'), {
      target: { value: 'Recorder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record signature' }));
    await waitFor(() =>
      expect(signBook).toHaveBeenCalledWith(
        expect.objectContaining({
          bookId: 'book',
          appointmentId: 'appointment',
          method: 'EXTERNAL',
          recordedBy: 'Recorder',
          evidenceReference: 'Signed form 5',
        }),
      ),
    );
    expect(await screen.findByText(/Delegate.*EXTERNAL.*recorded by Recorder.*Signed form 5/)).toBeInTheDocument();
  });
});

type Workspace = ResultsBookWorkspaceDto;
type Official = Workspace['officials'][number];
type EligibleResult = Workspace['eligibleRecordResults'][number];
type Claim = Workspace['recordClaims'][number];
type Book = Workspace['books'][number];

const EMPTY: Workspace = { officials: [], eligibleRecordResults: [], recordClaims: [], books: [] };
const APPOINTMENT_STATEMENT = 'Appointment recorded for this championship';
const CLAIM_STATEMENT = 'Evidence reviewed and action recorded';

function official(overrides: Partial<Official> = {}): Official {
  return {
    appointmentId: 'td',
    role: 'TECHNICAL_DELEGATE',
    officialName: 'Delegate',
    organization: null,
    appointedAt: '2026-09-08T08:00:00.000Z',
    officialActorId: null,
    ...overrides,
  };
}

function eligible(overrides: Partial<EligibleResult> = {}): EligibleResult {
  return {
    eventId: 'event',
    eventName: '10m Air Rifle Men',
    resultScope: 'QUALIFICATION',
    resultId: 'result',
    subjectKind: 'INDIVIDUAL',
    subjectId: 'athlete',
    subjectName: 'Ana Silva',
    nationCode: 'BRA',
    entryStatus: 'COMPETING',
    scoreX10: 6335,
    snapshotRevision: 'c'.repeat(64),
    ...overrides,
  };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim',
    championshipId: 'championship',
    source: eligible(),
    code: 'WR',
    resultBasis: 'QUALIFICATION_OR_ELIMINATION',
    benchmarkScoreX10: 6330,
    ruleReference: 'ISSF 6.14.9',
    claimedBy: 'Recorder',
    achievedAt: '2026-09-08T09:00:00.000Z',
    createdAt: '2026-09-08T09:10:00.000Z',
    status: 'DRAFT',
    entries: [],
    ...overrides,
  };
}

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book',
    championshipId: 'championship',
    versionNumber: 1,
    sourceHash: 'a'.repeat(64),
    findings: [],
    requiredSigners: [],
    signatures: [],
    createdBy: 'Recorder',
    createdAt: '2026-09-08T12:00:00.000Z',
    status: 'DRAFT',
    finalizedAt: null,
    ...overrides,
  };
}

async function renderPanel(workspace: Workspace, accounts: { id: string; name: string }[] = []) {
  getWorkspace.mockResolvedValue(ok(workspace));
  getSigningAccounts.mockResolvedValue(ok(accounts));
  const view = render(<ResultsBookPanel championshipId="championship" />);
  await waitFor(() => expect(getSigningAccounts).toHaveBeenCalled());
  await screen.findAllByText(workspace.books.length === 0 ? 'No Results Book versions.' : /^Version \d+ ·/);
  return view;
}

function section(summary: string): HTMLElement {
  return screen.getByText(summary).closest('details')!;
}

function claimItem(code: string): HTMLElement {
  return screen
    .getByText((_, element) => element?.tagName === 'P' && element.textContent!.startsWith(`${code} · `))
    .closest('li')!;
}

describe('ResultsBookPanel commands', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a failed load as its message or the rejected value', async () => {
    getWorkspace.mockResolvedValue(fail('Championship not found'));
    getSigningAccounts.mockResolvedValue(ok([]));
    let view = render(<ResultsBookPanel championshipId="championship" />);
    expect(await screen.findByText(/^Championship not found$/)).toBeVisible();
    expect(getWorkspace).toHaveBeenCalledWith({ championshipId: 'championship' });
    view.unmount();

    getWorkspace.mockResolvedValue(fail('Championship not found'));
    getSigningAccounts.mockResolvedValue(fail('Sign-in required'));
    view = render(<ResultsBookPanel championshipId="championship" />);
    expect(await screen.findByText(/^Sign-in required$/)).toBeVisible();
    expect(screen.queryByText('Championship not found')).not.toBeInTheDocument();
    view.unmount();

    getWorkspace.mockRejectedValueOnce('Bridge closed');
    view = render(<ResultsBookPanel championshipId="championship" />);
    expect(await screen.findByText(/^Bridge closed$/)).toBeVisible();
    view.unmount();

    getWorkspace.mockResolvedValue(ok(EMPTY));
    getSigningAccounts.mockRejectedValueOnce(new Error('IPC closed'));
    render(<ResultsBookPanel championshipId="championship" />);
    expect(await screen.findByText(/^IPC closed$/)).toBeVisible();
    getSigningAccounts.mockResolvedValue(ok([]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText('IPC closed')).not.toBeInTheDocument());
    expect(screen.getByText('No active appointments.')).toBeVisible();
  });

  it('records an appointment, clearing only the official, organization and account', async () => {
    await renderPanel(EMPTY, [{ id: 'account', name: 'Account Holder' }]);
    expect(section('1. Championship official appointments')).toHaveAttribute('open');
    const record = screen.getByRole('button', { name: 'Record appointment' });
    expect(record).toBeDisabled();
    expect(screen.getByLabelText('Appointment / revocation statement')).toHaveValue(APPOINTMENT_STATEMENT);

    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'RANGE_OFFICER' } });
    fireEvent.change(screen.getByLabelText('Signing account (optional)'), { target: { value: 'account' } });
    expect(screen.getByLabelText('Official name')).toHaveValue('Account Holder');
    fireEvent.change(screen.getByLabelText('Organization (optional)'), { target: { value: ' ISSF ' } });
    fireEvent.change(screen.getByLabelText('Recorded by'), { target: { value: ' Recorder ' } });
    appointOfficial.mockResolvedValueOnce(
      ok({
        ...EMPTY,
        officials: [
          official({
            appointmentId: 'range',
            role: 'RANGE_OFFICER',
            officialName: 'Account Holder',
            organization: 'ISSF',
          }),
        ],
      }),
    );
    fireEvent.click(record);

    expect(await screen.findByText('Range Officer · Account Holder · ISSF')).toBeInTheDocument();
    expect(section('1. Championship official appointments')).not.toHaveAttribute('open');
    expect(appointOfficial).toHaveBeenCalledWith({
      championshipId: 'championship',
      role: 'RANGE_OFFICER',
      officialName: 'Account Holder',
      organization: 'ISSF',
      statement: APPOINTMENT_STATEMENT,
      recordedBy: 'Recorder',
      officialActorId: 'account',
    });
    expect(screen.getByLabelText('Official name')).toHaveValue('');
    expect(screen.getByLabelText('Organization (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Signing account (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Role')).toHaveValue('RANGE_OFFICER');
    expect(screen.getByLabelText('Recorded by')).toHaveValue(' Recorder ');
    expect(screen.getByRole('option', { name: 'Rts Jury Chair' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: ' Second ' } });
    appointOfficial.mockResolvedValueOnce(fail('The appointment already exists'));
    fireEvent.click(record);
    expect(await screen.findByText(/^The appointment already exists$/)).toBeVisible();
    expect(appointOfficial).toHaveBeenLastCalledWith({
      championshipId: 'championship',
      role: 'RANGE_OFFICER',
      officialName: 'Second',
      statement: APPOINTMENT_STATEMENT,
      recordedBy: 'Recorder',
    });
    expect(screen.getByLabelText('Official name')).toHaveValue(' Second ');
  });

  it('revokes an appointment with the appointment statement and recorder', async () => {
    await renderPanel({ ...EMPTY, officials: [official({ organization: 'ISSF' })] });
    expect(section('1. Championship official appointments')).not.toHaveAttribute('open');
    const revoke = screen.getByRole('button', { name: 'Revoke' });
    expect(revoke).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Recorded by'), { target: { value: 'Recorder ' } });
    fireEvent.change(screen.getByLabelText('Appointment / revocation statement'), {
      target: { value: ' Appointment ended ' },
    });
    revokeOfficial.mockResolvedValueOnce(fail('The appointment signed a book'));
    fireEvent.click(revoke);
    expect(await screen.findByText(/^The appointment signed a book$/)).toBeVisible();
    expect(revokeOfficial).toHaveBeenCalledWith({
      championshipId: 'championship',
      appointmentId: 'td',
      statement: 'Appointment ended',
      recordedBy: 'Recorder',
    });

    revokeOfficial.mockResolvedValueOnce(ok(EMPTY));
    fireEvent.click(revoke);
    expect(await screen.findByText('No active appointments.')).toBeVisible();
    expect(screen.queryByText('The appointment signed a book')).not.toBeInTheDocument();
  });

  it('creates a record claim for the selected result, clearing only the record basis', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 8, 9, 30, 15));
    const team = eligible({
      resultScope: 'FINAL',
      resultId: 'team-result',
      subjectKind: 'TEAM',
      subjectName: 'Brazil',
      scoreX10: 12650,
    });
    await renderPanel({ ...EMPTY, eligibleRecordResults: [eligible(), team] });
    const result = screen.getByLabelText('Officially published result');
    await waitFor(() => expect(result).toHaveValue('QUALIFICATION:result'));
    expect(screen.getByLabelText('Achieved at')).toHaveValue('2026-09-08T09:30');
    expect(
      screen.getByRole('option', { name: '10m Air Rifle Men · Individual · Ana Silva · 633.5 · COMPETING' }),
    ).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Create record claim' });

    fireEvent.change(result, { target: { value: 'FINAL:team-result' } });
    fireEvent.change(screen.getByLabelText('ISSF record result basis'), { target: { value: 'FINAL' } });
    fireEvent.change(screen.getByLabelText('Record code'), { target: { value: 'QWR' } });
    fireEvent.change(screen.getByLabelText('Reference record score'), { target: { value: '1264.5' } });
    fireEvent.change(screen.getByLabelText('Claimed by'), { target: { value: ' Recorder ' } });
    fireEvent.change(screen.getByLabelText('Achieved at'), { target: { value: '2026-09-08T12:30' } });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Confirm this competition is the Olympic Games (required for OR codes)' }),
    );
    const created = claim({ code: 'QWR', source: team, resultBasis: 'FINAL' });
    createRecordClaim.mockResolvedValueOnce(
      ok({ ...EMPTY, eligibleRecordResults: [eligible(), team], recordClaims: [created] }),
    );
    fireEvent.click(create);

    expect(await screen.findByText('QWR · 10m Air Rifle Men · Team · Brazil · 1265.0')).toBeInTheDocument();
    expect(section('2. Record claims and verification')).not.toHaveAttribute('open');
    expect(screen.getByText('DRAFT · Final result · ISSF 6.14.9')).toBeInTheDocument();
    expect(createRecordClaim).toHaveBeenCalledWith({
      championshipId: 'championship',
      resultId: 'team-result',
      resultScope: 'FINAL',
      code: 'QWR',
      resultBasis: 'FINAL',
      benchmarkScoreX10: 12645,
      olympicGamesConfirmed: true,
      claimedBy: 'Recorder',
      achievedAt: new Date('2026-09-08T12:30').toISOString(),
    });
    expect(screen.getByLabelText('ISSF record result basis')).toHaveValue('');
    expect(create).toBeDisabled();
    expect(result).toHaveValue('FINAL:team-result');
    expect(screen.getByLabelText('Record code')).toHaveValue('QWR');
    expect(screen.getByLabelText('Reference record score')).toHaveValue('1264.5');
    expect(screen.getByLabelText('Claimed by')).toHaveValue(' Recorder ');

    fireEvent.change(screen.getByLabelText('Reference record score'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('ISSF record result basis'), {
      target: { value: 'RECOGNIZED_NO_FINAL_TOTAL' },
    });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Reference record score'), { target: { value: '1264.5' } });
    createRecordClaim.mockResolvedValueOnce(fail('The score does not exceed the record'));
    fireEvent.click(create);
    expect(await screen.findByText(/^The score does not exceed the record$/)).toBeVisible();
    expect(screen.getByLabelText('ISSF record result basis')).toHaveValue('RECOGNIZED_NO_FINAL_TOTAL');
  });

  it('appends claim entries with the delegate, the actor and the Technical Committee reference', async () => {
    const members = [
      {
        participantId: 'a',
        playerName: 'Ana',
        familyName: 'SILVA',
        nationCode: 'BRA',
        gender: 'F',
        entryStatus: 'COMPETING',
        scoreX10: 3165,
        classificationCode: null,
        decisionCount: 0,
      },
    ];
    await renderPanel({
      ...EMPTY,
      officials: [
        official(),
        official({ appointmentId: 'jury', role: 'RTS_JURY_CHAIR', officialName: 'Jury Chair' }),
        official({ appointmentId: 'td-2', officialName: 'Second Delegate' }),
      ],
      recordClaims: [
        claim({ id: 'draft', code: 'WR' }),
        claim({ id: 'submitted', code: 'QWR', status: 'SUBMITTED' }),
        claim({
          id: 'verified',
          code: 'EWR',
          status: 'VERIFIED',
          source: eligible({ subjectKind: 'MIXED_TEAM', members }),
        }),
        claim({ id: 'rejected', code: 'OR', status: 'REJECTED' }),
        claim({ id: 'confirmed', code: 'EOR', status: 'TD_CONFIRMED' }),
        claim({ id: 'void', code: 'QOR', status: 'VOID' }),
      ],
    });
    const delegate = screen.getByLabelText('Technical Delegate for confirmation');
    await waitFor(() => expect(delegate).toHaveValue('td'));
    expect(
      within(delegate)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Select active TD', 'Delegate', 'Second Delegate']);
    expect(screen.getByText('Members: Ana 316.5')).toBeInTheDocument();
    expect(within(claimItem('EWR')).getByText(/Mixed Team/)).toBeInTheDocument();
    expect(within(claimItem('QOR')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(claimItem('WR')).getByRole('button', { name: 'TD confirm' })).toBeEnabled();
    expect(within(claimItem('WR')).getByRole('button', { name: 'Void' })).toBeDisabled();
    expect(within(claimItem('EOR')).getByRole('button', { name: 'Record submission' })).toBeDisabled();
    expect(within(claimItem('OR')).getByRole('button', { name: 'Reopen' })).toBeDisabled();

    fireEvent.change(delegate, { target: { value: 'td-2' } });
    appendRecordClaimEntry.mockResolvedValueOnce(fail('The claim changed'));
    fireEvent.click(within(claimItem('WR')).getByRole('button', { name: 'TD confirm' }));
    expect(await screen.findByText(/^The claim changed$/)).toBeVisible();
    expect(appendRecordClaimEntry).toHaveBeenLastCalledWith({
      championshipId: 'championship',
      claimId: 'draft',
      type: 'TD_CONFIRMED',
      statement: CLAIM_STATEMENT,
      officialName: 'Second Delegate',
      appointmentId: 'td-2',
    });

    fireEvent.change(screen.getByLabelText('Actor for other actions'), { target: { value: ' Jury ' } });
    expect(within(claimItem('QWR')).getByRole('button', { name: 'Verify' })).toBeDisabled();
    expect(within(claimItem('EWR')).getByRole('button', { name: 'Void' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Technical Committee reference'), { target: { value: ' TC-1 ' } });
    fireEvent.change(screen.getByLabelText('Action statement'), { target: { value: ' Reviewed ' } });
    const actions: [string, string, string | undefined][] = [
      ['WR', 'Void', undefined],
      ['QWR', 'Verify', 'TC-1'],
      ['QWR', 'Reject', undefined],
      ['EWR', 'Void', 'TC-1'],
      ['OR', 'Reopen', undefined],
      ['EOR', 'Record submission', undefined],
    ];
    const types: Record<string, string> = {
      Void: 'VOID',
      Verify: 'TECHNICAL_COMMITTEE_VERIFIED',
      Reject: 'REJECTED',
      Reopen: 'REOPENED',
      'Record submission': 'SUBMITTED',
    };
    const ids: Record<string, string> = {
      WR: 'draft',
      QWR: 'submitted',
      EWR: 'verified',
      OR: 'rejected',
      EOR: 'confirmed',
    };
    for (const [code, action, reference] of actions) {
      appendRecordClaimEntry.mockResolvedValueOnce(fail(`${action} failed`));
      const button = within(claimItem(code)).getByRole('button', { name: action });
      await waitFor(() => expect(button).toBeEnabled());
      fireEvent.click(button);
      expect(await screen.findByText(new RegExp(`^${action} failed$`))).toBeVisible();
      expect(appendRecordClaimEntry).toHaveBeenLastCalledWith({
        championshipId: 'championship',
        claimId: ids[code],
        type: types[action],
        statement: 'Reviewed',
        officialName: 'Jury',
        ...(reference ? { reference } : {}),
      });
    }

    appendRecordClaimEntry.mockResolvedValueOnce(ok({ ...EMPTY, recordClaims: [] }));
    fireEvent.click(within(claimItem('WR')).getByRole('button', { name: 'TD confirm' }));
    expect(await screen.findByText('No record claims.')).toBeInTheDocument();
    expect(screen.queryByText('Record submission failed')).not.toBeInTheDocument();
  });

  it('generates, signs, certifies and exports book versions, showing failures', async () => {
    const signer = { appointmentId: 'td', role: 'TECHNICAL_DELEGATE' as const, officialName: 'Delegate' };
    await renderPanel({
      ...EMPTY,
      books: [
        book({ id: 'book-1', status: 'CERTIFIED', finalizedAt: '2026-09-08T13:00:00.000Z' }),
        book({ id: 'book-2', versionNumber: 2, sourceHash: 'b'.repeat(64), requiredSigners: [signer] }),
        book({ id: 'book-3', versionNumber: 3, sourceHash: 'c'.repeat(64), findings: ['Team results missing'] }),
        book({ id: 'book-4', versionNumber: 4, sourceHash: 'd'.repeat(64) }),
      ],
    });
    expect(section('3. Generate, certify and export Results Book')).toHaveAttribute('open');
    expect(screen.getAllByText(/^Version \d · /).map((element) => element.textContent)).toEqual([
      'Version 4 · DRAFT · dddddddddddd…',
      'Version 3 · DRAFT · cccccccccccc…',
      'Version 2 · DRAFT · bbbbbbbbbbbb…',
      'Version 1 · CERTIFIED · aaaaaaaaaaaa…',
    ]);
    expect(screen.getByText('Team results missing')).toBeVisible();
    expect(screen.getByText('Technical Delegate · Delegate · signature required')).toBeVisible();

    const generate = screen.getByRole('button', { name: 'Generate book version' });
    expect(generate).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Version prepared by'), { target: { value: ' Recorder ' } });
    generateBook.mockResolvedValueOnce(fail('Results are not final'));
    fireEvent.click(generate);
    expect(await screen.findByText(/^Results are not final$/)).toBeVisible();
    expect(generateBook).toHaveBeenCalledWith({ championshipId: 'championship', createdBy: 'Recorder' });

    fireEvent.change(screen.getByLabelText('Signer statement'), { target: { value: ' Signed ' } });
    signBook.mockResolvedValueOnce(fail('Sign-in required'));
    const sign = screen.getByRole('button', { name: 'Sign' });
    await waitFor(() => expect(sign).toBeEnabled());
    fireEvent.click(sign);
    expect(await screen.findByText(/^Sign-in required$/)).toBeVisible();
    expect(signBook).toHaveBeenCalledWith({
      championshipId: 'championship',
      bookId: 'book-2',
      appointmentId: 'td',
      statement: 'Signed',
      method: 'SELF',
    });

    const certify = screen.getAllByRole('button', { name: 'Certify' });
    expect(certify.map((button) => (button as HTMLButtonElement).disabled)).toEqual([true, true, true]);
    fireEvent.change(screen.getByLabelText('Finalized by'), { target: { value: ' Chair ' } });
    expect(certify.map((button) => (button as HTMLButtonElement).disabled)).toEqual([false, true, true]);
    finalizeBook.mockResolvedValueOnce(fail('Signatures are missing'));
    fireEvent.click(certify[0]!);
    expect(await screen.findByText(/^Signatures are missing$/)).toBeVisible();
    expect(finalizeBook).toHaveBeenCalledWith({
      championshipId: 'championship',
      bookId: 'book-4',
      officialName: 'Chair',
      statement: 'Required contents and certification signatures have been verified',
    });

    exportBook.mockResolvedValueOnce(fail('The disk is full')).mockResolvedValueOnce(ok({ status: 'CANCELLED' }));
    const exportPdf = screen.getByRole('button', { name: 'Export PDF' });
    await waitFor(() => expect(exportPdf).toBeEnabled());
    fireEvent.click(exportPdf);
    expect(await screen.findByText(/^The disk is full$/)).toBeVisible();
    expect(exportBook).toHaveBeenCalledWith({ bookId: 'book-1', format: 'PDF' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export JSON' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    await waitFor(() => expect(screen.queryByText('The disk is full')).not.toBeInTheDocument());
    expect(exportBook).toHaveBeenLastCalledWith({ bookId: 'book-1', format: 'JSON' });
    expect(screen.getAllByText(/^Version \d · /)).toHaveLength(4);
  });

  it('keeps the external signature fields while the method changes', async () => {
    await renderPanel({ ...EMPTY, books: [book()] });
    fireEvent.change(screen.getByLabelText('Signature method'), { target: { value: 'EXTERNAL' } });
    fireEvent.change(screen.getByLabelText('Signed document / evidence reference'), { target: { value: 'Form 5' } });
    fireEvent.change(screen.getByLabelText('Recorded by (uses signed-in operator when available)'), {
      target: { value: 'Clerk' },
    });
    fireEvent.change(screen.getByLabelText('Signature method'), { target: { value: 'SELF' } });
    expect(screen.queryByLabelText('Signed document / evidence reference')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Signature method'), { target: { value: 'EXTERNAL' } });
    expect(screen.getByLabelText('Signed document / evidence reference')).toHaveValue('Form 5');
    expect(screen.getByLabelText('Recorded by (uses signed-in operator when available)')).toHaveValue('Clerk');
  });

  it('disables every command while one is pending', async () => {
    await renderPanel({
      ...EMPTY,
      officials: [official()],
      recordClaims: [claim()],
      books: [book({ id: 'book-1', status: 'CERTIFIED' })],
    });
    let finish: (value: unknown) => void = () => {};
    generateBook.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    fireEvent.change(screen.getByLabelText('Version prepared by'), { target: { value: 'Recorder' } });
    fireEvent.change(screen.getByLabelText('Recorded by'), { target: { value: 'Recorder' } });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Second' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate book version' }));
    for (const name of [
      'Refresh',
      'Record appointment',
      'Revoke',
      'TD confirm',
      'Generate book version',
      'Export JSON',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    await act(async () => finish(ok(EMPTY)));
    expect(await screen.findByText('No active appointments.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Record appointment' })).toBeEnabled();
  });
});
