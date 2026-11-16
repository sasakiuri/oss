import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StartListPanel } from '@/renderer/presentation/features/championship/components/StartListPanel';
import { startListsService } from '@/renderer/services';
import type { StartListEntryDto, StartListRowDto, StartListVersionDto } from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../../helpers/renderer/mockServices')).mockServices(),
);

const DEFAULT_STATEMENT = 'Names, Bibs, relays, firing points, and distribution details checked';

function startList(overrides: Partial<StartListVersionDto> = {}): StartListVersionDto {
  return {
    id: 'version-1',
    eventId: 'event',
    versionNumber: 1,
    listKind: 'QUALIFICATION',
    disciplineGroup: 'RIFLE_PISTOL',
    distributionMode: 'PRINTED',
    eventNameSnapshot: '10m Air Rifle Men',
    competitionTypeIdSnapshot: 'AR60',
    scheduledStartAt: '2026-09-09T01:00:00.000Z',
    publicationDueAt: '2026-09-08T07:00:00.000Z',
    substitutionDeadlineAt: '2026-09-09T00:00:00.000Z',
    sourceHash: 'abcdef0123456789'.repeat(4),
    rows: [],
    findings: [],
    createdBy: 'Operator',
    createdAt: '2026-09-08T06:00:00.000Z',
    status: 'DRAFT',
    contentApproval: null,
    paperlessApproval: null,
    distributions: [],
    voidEntry: null,
    withdrawalEntry: null,
    distributedChannels: [],
    deadlineStatus: 'PENDING',
    stale: false,
    integrityValid: true,
    isCurrent: false,
    ...overrides,
  };
}

function entry(type: StartListEntryDto['type']): StartListEntryDto {
  return {
    id: `entry-${type}`,
    versionId: 'version-1',
    type,
    officialName: 'Delegate',
    officialRole: 'TECHNICAL_DELEGATE',
    statement: 'Checked',
    channels: [],
    finalReleaseBasis: null,
    recordedAt: '2026-09-08T08:00:00.000Z',
  };
}

function row(overrides: Partial<StartListRowDto>): StartListRowDto {
  return {
    participantId: 'participant',
    startNumber: null,
    issfId: null,
    athleteName: 'Athlete',
    familyName: 'ATHLETE',
    affiliation: '',
    nationCode: null,
    gender: 'M',
    entryStatus: 'COMPETING',
    teamId: null,
    teamName: null,
    relayNumber: null,
    firingPointNumber: null,
    ...overrides,
  };
}

async function renderWith(versions: StartListVersionDto[], props: { round?: 'Final'; sourceDirty?: boolean } = {}) {
  vi.mocked(startListsService.list).mockResolvedValue(ok(versions));
  const view = render(<StartListPanel eventId="event" round={props.round} sourceDirty={props.sourceDirty ?? false} />);
  if (versions.length > 0) await screen.findByRole('combobox', { name: 'Stored Start List version' });
  else await waitFor(() => expect(startListsService.list).toHaveBeenCalledWith({ eventId: 'event' }));
  return view;
}

function readBlobBytes(blob: Blob): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Buffer.from(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StartListPanel', () => {
  it('shows a failed load as its message', async () => {
    vi.mocked(startListsService.list).mockResolvedValue(fail('Event not found'));
    render(<StartListPanel eventId="event" sourceDirty={false} />);
    expect(await screen.findByText(/^Event not found$/)).toBeVisible();
    expect(screen.queryByRole('combobox', { name: 'Stored Start List version' })).not.toBeInTheDocument();
  });

  it('defaults the list kind from the round and the times from the clock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 8, 9, 30, 15));
    await renderWith([], { round: 'Final' });
    expect(screen.getByLabelText('List kind')).toHaveValue('FINAL');
    expect(screen.getByLabelText('Scheduled start')).toHaveValue('2026-09-09T10:00');
    expect(screen.getByLabelText('Publication deadline')).toHaveValue('2026-09-08T16:00');
    expect(screen.getByRole('option', { name: 'Pre event training' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Rifle pistol' })).toBeInTheDocument();
  });

  it('creates a snapshot version, then reloads and selects it', async () => {
    const created = startList({ id: 'version-2', versionNumber: 2, isCurrent: true });
    await renderWith([startList()]);
    vi.mocked(startListsService.list).mockResolvedValue(ok([startList(), created]));
    vi.mocked(startListsService.createVersion).mockResolvedValueOnce(ok(created));

    fireEvent.change(screen.getByLabelText('List kind'), { target: { value: 'ELIMINATION' } });
    fireEvent.change(screen.getByLabelText('Discipline'), { target: { value: 'SHOTGUN' } });
    fireEvent.change(screen.getByLabelText('Distribution'), { target: { value: 'PAPERLESS' } });
    fireEvent.change(screen.getByLabelText('Scheduled start'), { target: { value: '2026-09-10T09:00' } });
    fireEvent.change(screen.getByLabelText('Publication deadline'), { target: { value: '2026-09-09T18:30' } });
    fireEvent.change(screen.getByLabelText('Snapshot operator'), { target: { value: '  Operator  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create snapshot version' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Stored Start List version' })).toHaveValue('version-2'),
    );
    expect(startListsService.createVersion).toHaveBeenCalledWith({
      eventId: 'event',
      listKind: 'ELIMINATION',
      disciplineGroup: 'SHOTGUN',
      distributionMode: 'PAPERLESS',
      scheduledStartAt: new Date('2026-09-10T09:00').toISOString(),
      publicationDueAt: new Date('2026-09-09T18:30').toISOString(),
      createdBy: 'Operator',
    });
    expect(startListsService.list).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('option', { name: 'Qualification v2 · DRAFT · CURRENT' })).toBeInTheDocument();
    expect(screen.getByText('CURRENT DISTRIBUTED VERSION')).toBeVisible();
  });

  it('shows a successful command without a version as the fallback text and does not reload', async () => {
    await renderWith([]);
    vi.mocked(startListsService.createVersion).mockResolvedValueOnce({ success: true } as never);
    fireEvent.change(screen.getByLabelText('Snapshot operator'), { target: { value: 'Operator' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create snapshot version' }));

    expect(await screen.findByText(/^Start List operation failed$/)).toBeVisible();
    expect(screen.getByLabelText('Snapshot operator')).toHaveValue('Operator');
    expect(startListsService.list).toHaveBeenCalledTimes(1);
  });

  it('shows a failed command as its message, its fallback text or the rejected value', async () => {
    await renderWith([]);
    vi.mocked(startListsService.createVersion)
      .mockResolvedValueOnce(fail('Firing-point grid is incomplete'))
      .mockResolvedValueOnce({ success: false } as never)
      .mockRejectedValueOnce('Bridge closed');
    fireEvent.change(screen.getByLabelText('Snapshot operator'), { target: { value: 'Operator' } });
    const create = screen.getByRole('button', { name: 'Create snapshot version' });

    fireEvent.click(create);
    expect(await screen.findByText(/^Firing-point grid is incomplete$/)).toBeVisible();
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    expect(await screen.findByText(/^Start List operation failed$/)).toBeVisible();
    expect(screen.queryByText('Firing-point grid is incomplete')).not.toBeInTheDocument();
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);
    expect(await screen.findByText(/^Bridge closed$/)).toBeVisible();
    expect(startListsService.list).toHaveBeenCalledTimes(1);
  });

  it('blocks a snapshot while the firing-point grid is unsaved', async () => {
    await renderWith([startList()], { sourceDirty: true });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Delegate' } });
    expect(screen.getByText('Save the firing-point grid before creating a Start List version.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create snapshot version' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve content' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Void version' })).toBeEnabled();
  });

  it('approves content and voids a draft with the approval fields, showing failures', async () => {
    await renderWith([startList()]);
    vi.mocked(startListsService.approveContent).mockResolvedValueOnce(fail('The source changed'));
    vi.mocked(startListsService.voidVersion).mockResolvedValueOnce(fail('The version is already void'));
    expect(screen.getByLabelText('Audit statement')).toHaveValue(DEFAULT_STATEMENT);
    expect(screen.getByRole('button', { name: 'Approve content' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: ' Jury Member ' } });
    expect(screen.getByLabelText('Snapshot operator')).toHaveValue(' Jury Member ');
    fireEvent.change(screen.getByLabelText('Acting role'), { target: { value: 'RTS_JURY' } });
    fireEvent.change(screen.getByLabelText('Audit statement'), { target: { value: ' Checked twice ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve content' }));
    expect(await screen.findByText(/^The source changed$/)).toBeVisible();
    const approval = {
      versionId: 'version-1',
      officialName: 'Jury Member',
      officialRole: 'RTS_JURY',
      statement: 'Checked twice',
    };
    expect(startListsService.approveContent).toHaveBeenCalledWith(approval);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Void version' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Void version' }));
    expect(await screen.findByText(/^The version is already void$/)).toBeVisible();
    expect(startListsService.voidVersion).toHaveBeenCalledWith(approval);
  });

  it('records the Technical Delegate paperless approval', async () => {
    await renderWith([
      startList({ distributionMode: 'PAPERLESS', status: 'APPROVED', contentApproval: entry('CONTENT_APPROVED') }),
    ]);
    vi.mocked(startListsService.approvePaperless).mockResolvedValueOnce(fail('A Technical Delegate must approve'));
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Delegate' } });
    fireEvent.change(screen.getByLabelText('Acting role'), { target: { value: 'RTS_OFFICER' } });
    expect(screen.getByRole('button', { name: 'TD approve paperless' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Record publication & distribution' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Acting role'), { target: { value: 'TECHNICAL_DELEGATE' } });
    fireEvent.click(screen.getByRole('button', { name: 'TD approve paperless' }));
    expect(await screen.findByText(/^A Technical Delegate must approve$/)).toBeVisible();
    expect(startListsService.approvePaperless).toHaveBeenCalledWith({
      versionId: 'version-1',
      officialName: 'Delegate',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: DEFAULT_STATEMENT,
    });
    expect(screen.getByText('Content approved by Delegate.')).toBeVisible();
  });

  it('distributes through the checked channels and adds the Final release basis only for Finals', async () => {
    const approved = startList({ status: 'APPROVED', contentApproval: entry('CONTENT_APPROVED') });
    const { unmount } = await renderWith([approved]);
    vi.mocked(startListsService.distribute).mockResolvedValueOnce(fail('Publication deadline passed'));
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Delegate' } });
    expect(screen.getByRole('checkbox', { name: 'Print' })).toBeChecked();
    expect(screen.queryByLabelText('Final release basis · ISSF 6.8.12')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Website' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record publication & distribution' }));
    expect(await screen.findByText(/^Publication deadline passed$/)).toBeVisible();
    expect(startListsService.distribute).toHaveBeenCalledWith({
      versionId: 'version-1',
      officialName: 'Delegate',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: DEFAULT_STATEMENT,
      channels: ['PRINT', 'WEBSITE'],
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Print' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Website' }));
    expect(screen.getByRole('button', { name: 'Record publication & distribution' })).toBeDisabled();
    unmount();

    const final = startList({
      listKind: 'FINAL',
      status: 'DISTRIBUTED',
      distributionMode: 'PAPERLESS',
      contentApproval: entry('CONTENT_APPROVED'),
      paperlessApproval: entry('PAPERLESS_APPROVED'),
    });
    await renderWith([final]);
    vi.mocked(startListsService.distribute).mockResolvedValueOnce(ok(final));
    fireEvent.change(screen.getByLabelText('Distribution'), { target: { value: 'PAPERLESS' } });
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Delegate' } });
    fireEvent.change(screen.getByLabelText('Final release basis · ISSF 6.8.12'), {
      target: { value: 'NO_QUALIFICATION_IMPACT' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record redistribution' }));
    await waitFor(() => expect(startListsService.list).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('button', { name: 'Record redistribution' })).toBeEnabled();
    expect(startListsService.distribute).toHaveBeenCalledWith({
      versionId: 'version-1',
      officialName: 'Delegate',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: DEFAULT_STATEMENT,
      channels: ['EMAIL', 'PUBLIC_INFORMATION_STATION'],
      finalReleaseBasis: 'NO_QUALIFICATION_IMPACT',
    });
  });

  it('withdraws a distribution and shows a failure', async () => {
    await renderWith([startList({ status: 'DISTRIBUTED', contentApproval: entry('CONTENT_APPROVED') })]);
    vi.mocked(startListsService.withdrawDistribution).mockResolvedValueOnce(fail('Nothing to withdraw'));
    expect(screen.queryByRole('button', { name: 'Void version' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Official name'), { target: { value: 'Delegate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw distribution' }));
    expect(await screen.findByText(/^Nothing to withdraw$/)).toBeVisible();
    expect(startListsService.withdrawDistribution).toHaveBeenCalledWith({
      versionId: 'version-1',
      officialName: 'Delegate',
      officialRole: 'TECHNICAL_DELEGATE',
      statement: DEFAULT_STATEMENT,
    });
  });

  it('shows the stored versions, keeping the selection across a refresh', async () => {
    const first = startList({
      rows: [
        row({
          participantId: 'a',
          relayNumber: 1,
          firingPointNumber: 12,
          startNumber: '101',
          athleteName: 'Ana Silva',
          nationCode: 'BRA',
          affiliation: 'Club',
        }),
        row({ participantId: 'b', athleteName: 'Ben Ito', affiliation: 'Shooting Club', entryStatus: 'DNS' }),
      ],
      findings: [
        { code: 'block', severity: 'BLOCKING', ruleReference: '6.6.5', message: 'Missing Bib' },
        { code: 'warn', severity: 'WARNING', ruleReference: '6.6.6', message: 'Late' },
      ],
      stale: true,
    });
    const second = startList({ id: 'version-2', versionNumber: 2, listKind: 'FINAL', integrityValid: false });
    await renderWith([first, second]);

    expect(screen.getByRole('option', { name: 'Qualification v1 · DRAFT' })).toBeInTheDocument();
    expect(screen.getByText('SOURCE CHANGED')).toBeVisible();
    expect(screen.getByText('hash abcdef012345')).toBeVisible();
    expect(screen.getByText('BLOCKING · 6.6.5 · Missing Bib')).toHaveClass('text-vscode-error');
    expect(screen.getByText('WARNING · 6.6.6 · Late')).toHaveClass('text-vscode-warning');
    const cells = screen.getAllByRole('row').map((tableRow) => tableRow.textContent);
    expect(cells).toEqual([
      'RelayFPBibAthleteNationStatus',
      '112101Ana SilvaBRACOMPETING',
      '———Ben ItoShooting ClubDNS',
    ]);

    fireEvent.change(screen.getByRole('combobox', { name: 'Stored Start List version' }), {
      target: { value: 'version-2' },
    });
    expect(screen.getByText('INTEGRITY ERROR')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(startListsService.list).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('combobox', { name: 'Stored Start List version' })).toHaveValue('version-2');

    vi.mocked(startListsService.list).mockResolvedValue(ok([first]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Stored Start List version' })).toHaveValue('version-1'),
    );
  });

  it('downloads the CSV snapshot byte for byte', async () => {
    const version = startList({
      versionNumber: 3,
      listKind: 'PRE_EVENT_TRAINING',
      eventNameSnapshot: ' 10m Air Rifle / Men (Final) ',
      rows: [
        row({
          relayNumber: 1,
          firingPointNumber: 12,
          startNumber: '101',
          issfId: 'SHMUSA0101',
          athleteName: 'Zoë Müller',
          familyName: 'MÜLLER',
          nationCode: 'GER',
          affiliation: 'Club "Adler", Berlin',
          teamName: 'Germany 1',
          teamId: 'team-1',
        }),
        row({
          participantId: 'formula',
          athleteName: '=HYPERLINK("x")',
          familyName: '+SUM',
          affiliation: '-1',
          entryStatus: 'DNS',
          teamId: '@team',
        }),
        row({ participantId: 'blank', athleteName: 'Line\nBreak', familyName: 'TAB\t', affiliation: '' }),
      ],
    });
    await renderWith([version]);
    let blob: Blob | undefined;
    const createObjectURL = vi.fn((value: Blob) => {
      blob = value;
      return 'blob:start-list';
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const downloads: { href: string; download: string; connected: boolean }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, download: this.download, connected: this.isConnected });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV snapshot' }));

    expect(downloads).toEqual([
      { href: 'blob:start-list', download: '10m-Air-Rifle-Men-Final-pre_event_training-v3.csv', connected: false },
    ]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:start-list');
    expect(createObjectURL.mock.invocationCallOrder[0]).toBeLessThan(click.mock.invocationCallOrder[0]!);
    expect(click.mock.invocationCallOrder[0]).toBeLessThan(revokeObjectURL.mock.invocationCallOrder[0]!);
    expect(blob?.type).toBe('text/csv;charset=utf-8');
    const expected =
      '\uFEFF' +
      [
        '"Relay","Firing point","Bib","ISSF ID","Athlete","Family name","Nation","Affiliation","Status","Team"',
        '"1","12","101","SHMUSA0101","Zoë Müller","MÜLLER","GER","Club ""Adler"", Berlin","COMPETING","Germany 1"',
        '"","","","","\'=HYPERLINK(""x"")","\'+SUM","","\'-1","DNS","\'@team"',
        '"","","","","Line\nBreak","TAB\t","","","COMPETING",""',
      ].join('\r\n');
    const bytes = await readBlobBytes(blob!);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(expected);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.equals(Buffer.from(expected, 'utf8'))).toBe(true);
  });

  it('names the CSV after the event, falling back when no safe character remains', async () => {
    const names = [
      ['--Event--', 'OTHER', 1, '-Event--other-v1.csv'],
      ['Ä Ö Ü ß', 'FINAL', 2, 'start-list-final-v2.csv'],
      ['Air.Rifle_10m-Men', 'ELIMINATION', 4, 'Air.Rifle_10m-Men-elimination-v4.csv'],
    ] as const;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:name') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    for (const [eventNameSnapshot, listKind, versionNumber] of names) {
      const { unmount } = await renderWith([startList({ eventNameSnapshot, listKind, versionNumber })]);
      fireEvent.click(screen.getByRole('button', { name: 'Download CSV snapshot' }));
      unmount();
    }
    expect(downloads).toEqual(names.map((name) => name[3]));
  });
});
