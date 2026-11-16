import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IncidentReportsView } from '@/renderer/presentation/features/incident-reports/IncidentReportsView';
import type {
  IncidentReportEntryDto,
  IncidentReportEventStatusDto,
  RangeIncidentReportDto,
  UncoveredIncidentDecisionDto,
} from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const REPORT_ID = '22222222-2222-4222-8222-222222222222';
const DECISION_ID = '33333333-3333-4333-8333-333333333333';
const RESULT_ID = '44444444-4444-4444-8444-444444444444';
const EVENT_TWO_ID = '66666666-6666-4666-8666-666666666666';

const { listByEvent, create, appendEntry, openIncidentReportPrint } = vi.hoisted(() => ({
  listByEvent: vi.fn(),
  create: vi.fn(),
  appendEntry: vi.fn(),
  openIncidentReportPrint: vi.fn(),
}));

vi.mock('@/renderer/services', () => ({
  incidentReportsService: { listByEvent, create, appendEntry },
  boardService: { openIncidentReportPrint },
}));

function reportFixture(): RangeIncidentReportDto {
  return {
    id: REPORT_ID,
    eventId: EVENT_ID,
    serialNumber: 'IR-42',
    eventName: '10m Air Rifle',
    occurredAt: '2026-08-29T01:02:03.000Z',
    relayNumber: 1,
    firingPointNumber: 12,
    athleteName: 'Alex Athlete',
    bibNumber: '42',
    nationality: 'JPN',
    stage: 'Qualification',
    series: '3',
    details: 'Target stopped responding.',
    ruleReferences: '6.14.6',
    penalty: 'Extra time granted',
    scoreAmendmentReference: null,
    initiatorRole: 'RANGE_OFFICER',
    initiatorName: 'Range Officer A',
    createdAt: '2026-08-29T01:05:00.000Z',
    entries: [],
    linkedDecisions: [],
    missingSignatureRoles: ['COMPETITION_JURY_MEMBER', 'RTS_OFFICER', 'RTS_JURY_MEMBER', 'RANKING_TECHNICAL_OFFICER'],
    forwarded: false,
    voided: false,
  };
}

function statusFixture(reports: RangeIncidentReportDto[] = [reportFixture()]): IncidentReportEventStatusDto {
  return {
    eventId: EVENT_ID,
    reports,
    requiredDecisionCount: 1,
    coveredDecisionCount: 0,
    uncoveredDecisions: [
      {
        id: DECISION_ID,
        participantId: 'participant-1',
        relayNumber: 1,
        resultScope: 'QUALIFICATION',
        resultId: RESULT_ID,
        type: 'EXTRA_TIME',
        ruleReference: '6.11.3.2',
        publicRemark: 'Five minutes extra time',
        officialName: 'Jury A',
        decidedAt: '2026-08-29T01:03:00.000Z',
        active: true,
        incidentReportNumber: null,
        coverageIssue: 'MISSING_REFERENCE',
      },
    ],
  };
}

describe('IncidentReportsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByEvent.mockResolvedValue({ success: true, data: statusFixture() });
    create.mockResolvedValue({ success: true, data: reportFixture() });
    appendEntry.mockResolvedValue({
      success: true,
      data: {
        id: '55555555-5555-4555-8555-555555555555',
        reportId: REPORT_ID,
        type: 'FORWARDED',
        officialRole: null,
        destination: 'RTS Office',
        statement: 'Copy forwarded',
        officialName: 'Range Officer A',
        recordedAt: '2026-08-29T01:06:00.000Z',
      },
    });
    openIncidentReportPrint.mockResolvedValue({ success: true, data: 'window-1' });
  });

  it('shows decision coverage, report facts, append actions, and print routing', async () => {
    render(
      <IncidentReportsView
        eventId={EVENT_ID}
        eventName="10m Air Rifle"
        participants={[
          {
            id: 'participant-1',
            playerName: 'Alex Athlete',
            affiliation: 'JPN',
            logoPath: null,
            sortOrder: 0,
          },
        ]}
      />,
    );

    expect(await screen.findByText('Five minutes extra time · Rule 6.11.3.2')).toBeInTheDocument();
    expect(screen.getByText('IR number missing')).toBeInTheDocument();
    expect(screen.getByText('Target stopped responding.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Print operational copy' }));
    await waitFor(() => expect(openIncidentReportPrint).toHaveBeenCalledWith({ reportId: REPORT_ID }));

    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'FORWARDED' } });
    fireEvent.change(screen.getByLabelText('Official printed name'), { target: { value: 'Range Officer A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Append entry' }));

    await waitFor(() =>
      expect(appendEntry).toHaveBeenCalledWith({
        reportId: REPORT_ID,
        type: 'FORWARDED',
        destination: 'RTS Office / Scoring and Results Office',
        officialName: 'Range Officer A',
      }),
    );
  });

  it('creates a report from the event-level workspace without requiring an athlete', async () => {
    listByEvent.mockResolvedValueOnce({ success: true, data: statusFixture([]) });
    render(<IncidentReportsView eventId={EVENT_ID} eventName="10m Air Rifle" participants={[]} />);

    fireEvent.click(await screen.findByRole('button', { name: 'New incident report' }));
    fireEvent.change(screen.getByLabelText('IR serial number'), { target: { value: 'IR-43' } });
    fireEvent.change(screen.getByLabelText('Brief details of incident'), {
      target: { value: 'Range-wide target interruption.' },
    });
    fireEvent.change(screen.getByLabelText('Initiating official printed name'), {
      target: { value: 'Range Officer B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create report' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: EVENT_ID,
          serialNumber: 'IR-43',
          details: 'Range-wide target interruption.',
          ruleReferences: '6.14.6',
          initiatorRole: 'RANGE_OFFICER',
          initiatorName: 'Range Officer B',
          occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
      ),
    );
  });

  it('does not display an old event response after the selected event changes', async () => {
    let resolveFirst!: (value: { success: true; data: IncidentReportEventStatusDto }) => void;
    const firstRequest = new Promise<{ success: true; data: IncidentReportEventStatusDto }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondReport = {
      ...reportFixture(),
      id: '77777777-7777-4777-8777-777777777777',
      eventId: EVENT_TWO_ID,
      serialNumber: 'IR-99',
      eventName: '10m Air Pistol',
    };
    listByEvent
      .mockReset()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce({
        success: true,
        data: {
          ...statusFixture([secondReport]),
          eventId: EVENT_TWO_ID,
          requiredDecisionCount: 0,
          coveredDecisionCount: 0,
          uncoveredDecisions: [],
        },
      });
    const { rerender } = render(<IncidentReportsView eventId={EVENT_ID} eventName="10m Air Rifle" participants={[]} />);

    rerender(<IncidentReportsView eventId={EVENT_TWO_ID} eventName="10m Air Pistol" participants={[]} />);
    expect((await screen.findAllByText('IR IR-99')).length).toBeGreaterThan(0);

    await act(async () => resolveFirst({ success: true, data: statusFixture() }));

    await waitFor(() => expect(screen.queryAllByText('IR IR-42')).toHaveLength(0));
    expect(screen.getAllByText('IR IR-99').length).toBeGreaterThan(0);
  });
});

describe('IncidentReportsView workspace', () => {
  const FORWARDED_ID = '88888888-8888-4888-8888-888888888888';
  const VOIDED_ID = '99999999-9999-4999-8999-999999999999';
  const CREATED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  const report = (overrides: Partial<RangeIncidentReportDto> = {}): RangeIncidentReportDto => ({
    ...reportFixture(),
    ...overrides,
  });
  const forwarded = () =>
    report({ id: FORWARDED_ID, serialNumber: 'IR-43', forwarded: true, athleteName: 'Blair Athlete' });
  const voided = () =>
    report({
      id: VOIDED_ID,
      serialNumber: 'IR-44',
      voided: true,
      athleteName: null,
      occurredAt: '2026-08-29T02:00:00.000Z',
    });
  const status = (reports: RangeIncidentReportDto[], overrides: Partial<IncidentReportEventStatusDto> = {}) => ({
    ...statusFixture(reports),
    ...overrides,
  });
  const auditEntry = (overrides: Partial<IncidentReportEntryDto> = {}): IncidentReportEntryDto => ({
    id: '55555555-5555-4555-8555-555555555555',
    reportId: REPORT_ID,
    type: 'SIGNATURE',
    officialRole: 'RTS_OFFICER',
    destination: null,
    statement: 'Checked the scores.',
    officialName: 'RTS A',
    recordedAt: '2026-08-29T01:06:00.000Z',
    ...overrides,
  });

  const errorBanner = () => document.querySelector('div.border-l-2.border-vscode-error');
  const reportRows = () => [...document.querySelectorAll('aside button')] as HTMLElement[];
  const detail = () => screen.getByRole('heading', { level: 3 }).closest('article') as HTMLElement;
  const appendForm = () => screen.getByRole('form', { name: /^Append entry to IR / });
  const createForm = () => screen.getByRole('form', { name: 'Create Range Incident Report' });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  async function renderView(participants: Parameters<typeof IncidentReportsView>[0]['participants'] = []) {
    const view = render(
      <IncidentReportsView eventId={EVENT_ID} eventName="10m Air Rifle" participants={participants} />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    return view;
  }

  function fillAppend(action: string, statement: string, official = 'Jury B') {
    fireEvent.change(within(appendForm()).getByLabelText('Action'), { target: { value: action } });
    fireEvent.change(within(appendForm()).getByRole('textbox', { name: /Void reason|Audit note|Statement/ }), {
      target: { value: statement },
    });
    fireEvent.change(within(appendForm()).getByLabelText('Official printed name'), { target: { value: official } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    listByEvent.mockReset().mockResolvedValue(ok(status([reportFixture(), forwarded(), voided()])));
    create.mockReset();
    appendEntry.mockReset().mockResolvedValue(ok(auditEntry()));
    openIncidentReportPrint.mockReset().mockResolvedValue(ok('window-1'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('report list', () => {
    it('summarizes the event, lists the newest report first and selects the newest active report', async () => {
      await renderView();

      const cards = [...document.querySelector('section.grid')!.children].map((card) => card.textContent);
      expect(cards).toEqual(['Active reports2', 'Scoring-decision coverage0 / 1', 'Forwarding not recorded1']);
      expect(screen.getByText('Reports (3)')).toBeInTheDocument();
      expect(reportRows().map((row) => row.textContent)).toEqual([
        `IR IR-44VoidGeneral range incident${new Date('2026-08-29T02:00:00.000Z').toLocaleString()}`,
        `IR IR-43SentBlair Athlete${new Date('2026-08-29T01:02:03.000Z').toLocaleString()}`,
        `IR IR-42OpenAlex Athlete${new Date('2026-08-29T01:02:03.000Z').toLocaleString()}`,
      ]);
      expect(within(reportRows()[0]!).getByText('Void')).toHaveAttribute('class', 'text-vscode-error');
      expect(within(reportRows()[1]!).getByText('Sent')).toHaveAttribute('class', 'text-vscode-success');
      expect(within(reportRows()[2]!).getByText('Open')).toHaveAttribute('class', 'text-vscode-warning');
      expect(reportRows()[1]).toHaveAttribute(
        'class',
        'block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 bg-vscode-highlight',
      );
      expect(reportRows()[0]).toHaveAttribute(
        'class',
        'block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 hover:bg-vscode-bg-hover',
      );
      expect(reportRows()[0]).toHaveAttribute('type', 'button');
      expect(within(detail()).getByRole('heading', { name: 'IR IR-43' })).toBeInTheDocument();
    });

    it('keeps the selected report on refresh and selects the newest report when all are void', async () => {
      await renderView();
      fireEvent.click(reportRows()[2]!);
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(listByEvent).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
      expect(within(detail()).getByRole('heading', { name: 'IR IR-42' })).toBeInTheDocument();

      listByEvent.mockResolvedValue(
        ok(status([voided(), report({ id: CREATED_ID, serialNumber: 'IR-45', voided: true })])),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      expect(await screen.findByRole('heading', { level: 3, name: 'IR IR-45' })).toBeInTheDocument();
    });

    it('shows the loading text, then the empty state unless a report is being created', async () => {
      const pending = deferred<ReturnType<typeof ok<IncidentReportEventStatusDto>>>();
      listByEvent.mockReset().mockReturnValueOnce(pending.promise);
      render(<IncidentReportsView eventId={EVENT_ID} participants={[]} />);

      expect(screen.getByText('Loading incident reports…')).toHaveAttribute(
        'class',
        'text-[13px] text-vscode-text-muted',
      );
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'New incident report' })).toBeEnabled();
      expect(screen.getByText('ISSF 6.14.6 append-only Form IR ledger.')).toBeInTheDocument();
      const cards = [...document.querySelector('section.grid')!.children].map((card) => card.textContent);
      expect(cards).toEqual(['Active reports0', 'Scoring-decision coverage0 / 0', 'Forwarding not recorded0']);

      await act(async () => pending.resolve(ok(status([], { uncoveredDecisions: [] }))));

      expect(screen.queryByText('Loading incident reports…')).not.toBeInTheDocument();
      expect(screen.getByText('No Range Incident Reports')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'New incident report' }));
      expect(screen.queryByText('No Range Incident Reports')).not.toBeInTheDocument();
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Cancel' }));
      expect(screen.getByText('No Range Incident Reports')).toBeInTheDocument();
    });

    it.each([
      ['a failed response', () => listByEvent.mockResolvedValueOnce(fail('Event not found')), 'Event not found'],
      ['a rejected Error', () => listByEvent.mockRejectedValueOnce(new Error('Bridge closed')), 'Bridge closed'],
      ['a rejected value', () => listByEvent.mockRejectedValueOnce('offline'), 'Failed to load Range Incident Reports'],
    ])('shows %s of the list in the panel error until the next load', async (_name, failLoad, message) => {
      listByEvent.mockReset().mockResolvedValue(ok(status([reportFixture()])));
      failLoad();
      render(<IncidentReportsView eventId={EVENT_ID} participants={[]} />);

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(errorBanner()).toHaveAttribute(
        'class',
        'border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error',
      );
      expect(errorBanner()).not.toHaveAttribute('role');
      expect(screen.queryByText('Reports (1)')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await screen.findByText('Reports (1)');
      expect(errorBanner()).toBeNull();
    });

    it('lists the decisions that need an active registered report', async () => {
      const decision = statusFixture().uncoveredDecisions[0]!;
      const uncovered: UncoveredIncidentDecisionDto[] = [
        decision,
        {
          ...decision,
          id: 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
          participantId: 'participant-2',
          type: 'REPEAT_SERIES',
          incidentReportNumber: 'IR-9',
          coverageIssue: 'REPORT_NOT_FOUND',
        },
        {
          ...decision,
          id: 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3',
          incidentReportNumber: 'IR-44',
          coverageIssue: 'REPORT_VOIDED',
        },
        {
          ...decision,
          id: 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4',
          coverageIssue: 'SOMETHING_NEW' as UncoveredIncidentDecisionDto['coverageIssue'],
        },
      ];
      listByEvent.mockResolvedValue(ok(status([reportFixture()], { uncoveredDecisions: uncovered })));
      await renderView([
        { id: 'participant-1', playerName: 'Alex Athlete', affiliation: 'JPN', logoPath: null, sortOrder: 0 },
      ]);

      const section = screen.getByText('Decisions needing an active registered IR').closest('section') as HTMLElement;
      expect([...section.querySelectorAll('div.text-xs')].map((item) => item.textContent)).toEqual([
        'EXTRA TIME · Alex Athlete · Relay 1IR number missingFive minutes extra time · Rule 6.11.3.2',
        'REPEAT SERIES · participant-2 · Relay 1Referenced IR is not registeredFive minutes extra time · Rule 6.11.3.2 · IR IR-9',
        'EXTRA TIME · Alex Athlete · Relay 1Referenced IR is voidedFive minutes extra time · Rule 6.11.3.2 · IR IR-44',
        'EXTRA TIME · Alex Athlete · Relay 1SOMETHING_NEWFive minutes extra time · Rule 6.11.3.2',
      ]);
    });

    it('discards the entry draft when another report is selected', async () => {
      await renderView();
      fillAppend('NOTE', 'Draft note');
      fireEvent.click(reportRows()[2]!);
      expect(within(appendForm()).getByLabelText('Statement (optional)')).toHaveValue('');
      fireEvent.click(reportRows()[1]!);
      expect(within(appendForm()).getByLabelText('Action')).toHaveValue('SIGNATURE');
      expect(within(appendForm()).getByLabelText('Official printed name')).toHaveValue('');
    });

    it('clears the selection and closes the create form when the event changes', async () => {
      const { rerender } = await renderView();
      fireEvent.click(screen.getByRole('button', { name: 'New incident report' }));
      const pending = deferred<ReturnType<typeof ok<IncidentReportEventStatusDto>>>();
      listByEvent.mockReturnValueOnce(pending.promise);

      rerender(<IncidentReportsView eventId={EVENT_TWO_ID} eventName="10m Air Pistol" participants={[]} />);

      expect(listByEvent).toHaveBeenLastCalledWith({ eventId: EVENT_TWO_ID });
      expect(screen.queryByRole('form', { name: 'Create Range Incident Report' })).not.toBeInTheDocument();
      expect(screen.getByText('Select a report.')).toBeInTheDocument();
      expect(reportRows()).toHaveLength(3);
      expect(screen.getByText('Loading incident reports…')).toBeInTheDocument();

      await act(async () => pending.resolve(ok(status([], { eventId: EVENT_TWO_ID }))));
      expect(screen.getByText('No Range Incident Reports')).toBeInTheDocument();
    });
  });

  describe('creating a report', () => {
    it('starts at the current local minute and sends only the facts that were entered', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 7, 29, 10, 15, 42));
      listByEvent.mockReset().mockResolvedValue(ok(status([])));
      create.mockResolvedValue(ok(report({ id: CREATED_ID, serialNumber: 'IR-50' })));
      await renderView([
        { id: 'participant-1', playerName: 'Alex Athlete', affiliation: 'JPN', logoPath: null, sortOrder: 0 },
      ]);
      fireEvent.click(screen.getByRole('button', { name: 'New incident report' }));
      const form = createForm();

      expect(within(form).getByLabelText('Incident date and time')).toHaveValue('2026-08-29T10:15');
      expect(within(form).getByLabelText('Applicable ISSF rules')).toHaveValue('6.14.6');
      expect(within(form).getByLabelText('Initiating official role')).toHaveValue('RANGE_OFFICER');
      expect(optionTexts(within(form).getByLabelText('Initiating official role'))).toEqual([
        'Range Officer',
        'Competition Jury Member',
        'RTS Officer',
        'RTS Jury Member',
        'Ranking Technical Officer',
        'Other Official',
      ]);
      const datalist = document.getElementById(`incident-athletes-${EVENT_ID}`) as HTMLDataListElement;
      expect(within(form).getByLabelText(/^Athlete name/)).toHaveAttribute('list', `incident-athletes-${EVENT_ID}`);
      expect([...datalist.options].map((option) => [option.value, option.textContent])).toEqual([
        ['Alex Athlete', 'JPN'],
      ]);

      const fill = (label: string | RegExp, value: string) =>
        fireEvent.change(within(form).getByLabelText(label), { target: { value } });
      fill('IR serial number', 'IR-50');
      fill('Incident date and time', '2026-08-29T09:30');
      fill('Relay', '2');
      fill('Firing point', '07');
      fill(/^Athlete name/, ' Alex Athlete ');
      fill('Bib number', '  ');
      fill('Nationality', 'JPN');
      fill('Stage', '');
      fill('Series', '3');
      fill('Brief details of incident', 'Target froze.');
      fill('Penalty / action imposed', ' ');
      fill('Score amendment reference', 'SA-1');
      fill('Initiating official role', 'RTS_OFFICER');
      fill('Initiating official printed name', 'RTS A');
      fireEvent.click(within(form).getByRole('button', { name: 'Create report' }));

      await waitFor(() =>
        expect(create).toHaveBeenCalledWith({
          eventId: EVENT_ID,
          serialNumber: 'IR-50',
          occurredAt: new Date(2026, 7, 29, 9, 30).toISOString(),
          relayNumber: 2,
          firingPointNumber: 7,
          athleteName: ' Alex Athlete ',
          nationality: 'JPN',
          series: '3',
          details: 'Target froze.',
          ruleReferences: '6.14.6',
          scoreAmendmentReference: 'SA-1',
          initiatorRole: 'RTS_OFFICER',
          initiatorName: 'RTS A',
        }),
      );
    });

    it('selects the created report, closes the form and reloads the event', async () => {
      const created = report({ id: CREATED_ID, serialNumber: 'IR-50' });
      const pending = deferred<ReturnType<typeof ok<RangeIncidentReportDto>>>();
      create.mockReturnValueOnce(pending.promise);
      await renderView();
      fireEvent.click(screen.getByRole('button', { name: 'New incident report' }));
      fireEvent.change(within(createForm()).getByLabelText('IR serial number'), { target: { value: 'IR-50' } });
      fireEvent.change(within(createForm()).getByLabelText('Brief details of incident'), {
        target: { value: 'Froze.' },
      });
      fireEvent.change(within(createForm()).getByLabelText('Initiating official printed name'), {
        target: { value: 'RO A' },
      });
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Create report' }));

      expect(within(createForm()).getByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(within(createForm()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(within(appendForm()).getByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();

      listByEvent.mockResolvedValue(ok(status([reportFixture(), forwarded(), voided(), created])));
      await act(async () => pending.resolve(ok(created)));

      await waitFor(() => expect(listByEvent).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole('form', { name: 'Create Range Incident Report' })).not.toBeInTheDocument();
      expect(await screen.findByRole('heading', { level: 3, name: 'IR IR-50' })).toBeInTheDocument();
      expect(reportRows()[0]).toHaveClass('bg-vscode-highlight');
    });

    it.each([
      ['a failed response', () => create.mockResolvedValue(fail('Serial already used')), 'Serial already used'],
      ['a rejected Error', () => create.mockRejectedValue(new Error('Bridge closed')), 'Bridge closed'],
      ['a rejected value', () => create.mockRejectedValue('offline'), 'Failed to create the Range Incident Report'],
    ])('shows %s of the creation in the panel error and keeps the form', async (_name, failCreate, message) => {
      failCreate();
      await renderView();
      fireEvent.click(screen.getByRole('button', { name: 'New incident report' }));
      fireEvent.change(within(createForm()).getByLabelText('IR serial number'), { target: { value: 'IR-42' } });
      fireEvent.change(within(createForm()).getByLabelText('Brief details of incident'), {
        target: { value: 'Froze.' },
      });
      fireEvent.change(within(createForm()).getByLabelText('Initiating official printed name'), {
        target: { value: 'RO A' },
      });
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Create report' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(within(createForm()).getByLabelText('IR serial number')).toHaveValue('IR-42');
      expect(within(createForm()).getByRole('button', { name: 'Create report' })).toBeEnabled();
      expect(listByEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('report detail', () => {
    it('shows the report facts, sign-offs, linked decisions and audit history', async () => {
      const decision = statusFixture().uncoveredDecisions[0]!;
      listByEvent.mockResolvedValue(
        ok(
          status([
            report({
              scoreAmendmentReference: 'SA-7',
              missingSignatureRoles: ['RTS_JURY_MEMBER'],
              linkedDecisions: [
                { ...decision, active: true },
                { ...decision, id: 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', type: 'MARK_MISS', active: false },
              ],
              entries: [
                auditEntry(),
                auditEntry({
                  id: '56565656-5656-4565-8565-565656565656',
                  type: 'FORWARDED',
                  officialRole: null,
                  destination: 'RTS Office',
                  statement: 'Copy forwarded.',
                  officialName: 'RO A',
                }),
              ],
              forwarded: true,
            }),
          ]),
        ),
      );
      await renderView();
      const article = detail();

      expect(within(article).getByText('Forwarded')).toHaveAttribute(
        'class',
        'text-xs font-medium text-vscode-success',
      );
      expect(
        within(article).getByText(`10m Air Rifle · ${new Date('2026-08-29T01:02:03.000Z').toLocaleString()}`),
      ).toBeInTheDocument();
      const facts = [...article.querySelectorAll('section.grid > div')].map((fact) => fact.textContent);
      expect(facts).toEqual([
        'Relay1',
        'Firing point12',
        'AthleteAlex Athlete',
        'Bib / nationality42 · JPN',
        'StageQualification',
        'Series3',
        'Rules6.14.6',
        'Score amendment ref.SA-7',
        'Incident detailsTarget stopped responding.',
        'Penalty / actionExtra time granted',
      ]);
      expect(
        [...article.querySelectorAll('span.rounded-full')].map((chip) => [chip.textContent, chip.className]),
      ).toEqual([
        [
          'Range Officer · Range Officer A (initiator)',
          'rounded-full border border-vscode-success/50 px-2 py-1 text-vscode-success',
        ],
        ['Rts Officer · RTS A', 'rounded-full border border-vscode-success/50 px-2 py-1 text-vscode-success'],
        ['Missing Rts Jury Member', 'rounded-full border border-vscode-warning/50 px-2 py-1 text-vscode-warning'],
      ]);
      expect(within(article).getByText('Linked scoring decisions (2)')).toBeInTheDocument();
      const decisions = [...article.querySelectorAll('div.border-l-2.border-vscode-border')].map(
        (item) => item.textContent,
      );
      expect(decisions).toEqual([
        'EXTRA TIME · Relay 1ActiveFive minutes extra timeRule 6.11.3.2 · Jury A',
        'MARK MISS · Relay 1Audit historyFive minutes extra timeRule 6.11.3.2 · Jury A',
      ]);
      const history = [...article.querySelectorAll('div.rounded-\\[3px\\].p-3')].map((item) => item.textContent);
      expect(history).toEqual([
        `SIGNATURE · Rts OfficerChecked the scores.RTS A · ${new Date('2026-08-29T01:06:00.000Z').toLocaleString()}`,
        `FORWARDED · RTS OfficeCopy forwarded.RO A · ${new Date('2026-08-29T01:06:00.000Z').toLocaleString()}`,
      ]);
    });

    it('shows dashes for missing facts and the empty linked decisions and history', async () => {
      listByEvent.mockResolvedValue(
        ok(
          status([
            report({
              relayNumber: null,
              firingPointNumber: null,
              athleteName: null,
              bibNumber: null,
              nationality: null,
              stage: null,
              series: null,
              penalty: null,
            }),
          ]),
        ),
      );
      await renderView();
      const article = detail();

      expect(within(article).getByText('Forwarding not recorded')).toHaveAttribute(
        'class',
        'text-xs font-medium text-vscode-warning',
      );
      const facts = [...article.querySelectorAll('section.grid > div')].map((fact) => fact.textContent);
      expect(facts).toEqual([
        'Relay—',
        'Firing point—',
        'Athlete—',
        'Bib / nationality—',
        'Stage—',
        'Series—',
        'Rules6.14.6',
        'Score amendment ref.—',
        'Incident detailsTarget stopped responding.',
        'Penalty / action—',
      ]);
      expect(within(article).getByText('No scoring decision currently references this IR serial.')).toBeInTheDocument();
      expect(within(article).getByText('No entries after report initiation.')).toBeInTheDocument();
    });

    it('hides the entry form of a voided report', async () => {
      await renderView();
      fireEvent.click(reportRows()[0]!);

      expect(within(detail()).getByText('Voided')).toHaveAttribute('class', 'text-xs font-medium text-vscode-error');
      expect(screen.queryByRole('form', { name: /^Append entry to IR / })).not.toBeInTheDocument();
    });

    it.each([
      [
        'a sign-off with a statement',
        'SIGNATURE',
        'Scores agree.',
        { type: 'SIGNATURE', officialRole: 'COMPETITION_JURY_MEMBER', statement: 'Scores agree.' },
      ],
      [
        'a sign-off without a statement',
        'SIGNATURE',
        '  ',
        { type: 'SIGNATURE', officialRole: 'COMPETITION_JURY_MEMBER' },
      ],
      [
        'a forwarding',
        'FORWARDED',
        'Sent by runner.',
        { type: 'FORWARDED', destination: 'RTS Office / Scoring and Results Office', statement: 'Sent by runner.' },
      ],
      ['a note', 'NOTE', 'Athlete informed.', { type: 'NOTE', statement: 'Athlete informed.' }],
      ['a void entry', 'VOID', 'Wrong athlete.', { type: 'VOID', statement: 'Wrong athlete.' }],
    ])('appends %s, clears the statement and reloads the event', async (_name, action, statement, payload) => {
      await renderView();
      fireEvent.click(reportRows()[2]!);
      fillAppend(action, statement);
      fireEvent.click(within(appendForm()).getByRole('button', { name: /^Append/ }));

      await waitFor(() =>
        expect(appendEntry).toHaveBeenCalledWith({ reportId: REPORT_ID, officialName: 'Jury B', ...payload }),
      );
      await waitFor(() => expect(listByEvent).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(within(appendForm()).getByRole('textbox', { name: /Void reason|Audit note|Statement/ })).toHaveValue(''),
      );
      expect(within(appendForm()).getByLabelText('Official printed name')).toHaveValue('Jury B');
      expect(within(appendForm()).getByLabelText('Action')).toHaveValue(action);
    });

    it('labels each action and requires what it records', async () => {
      await renderView();
      fireEvent.click(reportRows()[2]!);
      const form = appendForm();
      const submit = () => within(form).getAllByRole('button').at(-1)!;

      expect(optionTexts(within(form).getByLabelText('Action'))).toEqual([
        'Add official sign-off',
        'Record copy forwarding',
        'Add audit note',
        'Void report',
      ]);
      expect(within(form).getByLabelText('Signing role')).toHaveValue('COMPETITION_JURY_MEMBER');
      expect(submit()).toHaveTextContent(/^Append entry$/);
      expect(submit()).toBeDisabled();
      fireEvent.change(within(form).getByLabelText('Official printed name'), { target: { value: 'Jury B' } });
      expect(submit()).toBeEnabled();

      fireEvent.change(within(form).getByLabelText('Action'), { target: { value: 'FORWARDED' } });
      expect(within(form).queryByLabelText('Signing role')).not.toBeInTheDocument();
      fireEvent.change(within(form).getByLabelText('Destination'), { target: { value: ' ' } });
      expect(submit()).toBeDisabled();

      fireEvent.change(within(form).getByLabelText('Action'), { target: { value: 'NOTE' } });
      expect(within(form).getByLabelText('Audit note')).toBeRequired();
      expect(submit()).toBeDisabled();
      fireEvent.change(within(form).getByLabelText('Audit note'), { target: { value: 'Noted.' } });
      expect(submit()).toBeEnabled();

      fireEvent.change(within(form).getByLabelText('Action'), { target: { value: 'VOID' } });
      expect(within(form).getByLabelText('Void reason')).toHaveValue('Noted.');
      expect(
        within(form).getByText(
          'Voiding is permanent. The report and all existing audit entries remain available for inspection.',
        ),
      ).toHaveAttribute('class', 'text-xs text-vscode-warning');
      expect(submit()).toHaveTextContent(/^Append void entry$/);
      expect(submit().className).toContain('text-vscode-error');
    });

    it('signs as the first missing role, else as a Competition Jury member', async () => {
      listByEvent.mockResolvedValue(
        ok(status([reportFixture(), report({ id: FORWARDED_ID, serialNumber: 'IR-43', missingSignatureRoles: [] })])),
      );
      await renderView();
      expect(within(appendForm()).getByLabelText('Signing role')).toHaveValue('COMPETITION_JURY_MEMBER');

      listByEvent.mockResolvedValue(
        ok(status([report({ missingSignatureRoles: ['RTS_OFFICER', 'RTS_JURY_MEMBER'] })])),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      expect(await screen.findByRole('heading', { level: 3, name: 'IR IR-42' })).toBeInTheDocument();
      expect(within(appendForm()).getByLabelText('Signing role')).toHaveValue('RTS_OFFICER');
    });

    it.each([
      ['a failed response', () => appendEntry.mockResolvedValue(fail('Report is void')), 'Report is void'],
      ['a rejected Error', () => appendEntry.mockRejectedValue(new Error('Bridge closed')), 'Bridge closed'],
      [
        'a rejected value',
        () => appendEntry.mockRejectedValue('offline'),
        'Failed to append the incident-report entry',
      ],
    ])('shows %s of an entry in the panel error and keeps the statement', async (_name, failAppend, message) => {
      failAppend();
      // Delay the configured failure so that the busy state can be observed first.
      const pendingResult = deferred<void>();
      appendEntry.mockImplementationOnce(async (...args: unknown[]) => {
        await pendingResult.promise;
        return appendEntry(...args);
      });
      await renderView();
      fillAppend('NOTE', 'Athlete informed.');
      fireEvent.click(within(appendForm()).getByRole('button', { name: 'Append entry' }));

      expect(within(appendForm()).getByRole('button', { name: 'Saving…' })).toBeDisabled();
      await act(async () => pendingResult.resolve());

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(within(appendForm()).getByLabelText('Audit note')).toHaveValue('Athlete informed.');
      expect(within(appendForm()).getByRole('button', { name: 'Append entry' })).toBeEnabled();
      expect(listByEvent).toHaveBeenCalledTimes(1);
    });

    it('clears the statement of a saved entry when the reload fails', async () => {
      await renderView();
      listByEvent.mockResolvedValueOnce(fail('Event ledger locked'));
      fillAppend('NOTE', 'Athlete informed.');
      fireEvent.click(within(appendForm()).getByRole('button', { name: 'Append entry' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(/^Event ledger locked$/));
      expect(within(appendForm()).getByLabelText('Audit note')).toHaveValue('');
    });

    it.each([
      [
        'a failed response',
        () => openIncidentReportPrint.mockResolvedValue(fail('No printer view')),
        'No printer view',
      ],
      [
        'a rejected value',
        () => openIncidentReportPrint.mockRejectedValue('offline'),
        'Failed to open the incident-report print view',
      ],
    ])('shows %s of the print view in the panel error', async (_name, failPrint, message) => {
      failPrint();
      await renderView();
      fireEvent.click(within(detail()).getByRole('button', { name: 'Print operational copy' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(openIncidentReportPrint).toHaveBeenCalledWith({ reportId: FORWARDED_ID });

      openIncidentReportPrint.mockResolvedValue(ok('window-2'));
      fireEvent.click(within(detail()).getByRole('button', { name: 'Print operational copy' }));
      await waitFor(() => expect(errorBanner()).toBeNull());
    });
  });
});

function optionTexts(select: HTMLElement) {
  return [...(select as HTMLSelectElement).options].map((option) => option.textContent);
}
