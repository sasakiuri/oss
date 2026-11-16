import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdjudicationCasesPanel } from '@/renderer/presentation/features/adjudication-cases/AdjudicationCasesPanel';
import {
  adjudicationCasesService,
  finalRecoveriesService,
  incidentReportsService,
  protestsService,
  rangeInterruptionsService,
  scoringDecisionsService,
  targetExaminationsService,
} from '@/renderer/services';
import type {
  AdjudicationCaseDto,
  FinalRecoveryCaseDto,
  RangeIncidentReportDto,
  ScoringDecisionDto,
} from '@/shared/ipc/contracts';

import { protestFixture } from '../../../../../helpers/protestFixture';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';
import { fixture as interruptionFixture } from '../range-interruptions/fixtures';
import { caseFixture as examinationFixture } from '../target-examinations/fixtures';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const cases = vi.mocked(adjudicationCasesService);

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const FIRST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CREATED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LINK_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function adjudicationCase(overrides: Partial<AdjudicationCaseDto> = {}): AdjudicationCaseDto {
  return {
    id: FIRST_ID,
    scopeType: 'EVENT',
    scopeId: EVENT_ID,
    category: 'RANGE_INCIDENT',
    subject: 'First case',
    summary: 'Target carrier stopped during relay 2',
    openedBy: 'Jury Member',
    openedAt: '2026-11-16T01:00:00.000Z',
    createdAt: '2026-11-16T01:00:00.000Z',
    status: 'OPEN',
    entries: [],
    links: [],
    linkHistory: [],
    ...overrides,
  };
}

const report = (overrides: Partial<RangeIncidentReportDto>) =>
  ({ id: 'report-1', serialNumber: '7', athleteName: 'Alex Athlete', ...overrides }) as RangeIncidentReportDto;
const decision = { id: 'decision-1', type: 'DEDUCTION', publicRemark: 'Two points deducted' } as ScoringDecisionDto;
const recovery = { id: 'recovery-1', incidentType: 'EST_FAILURE', summary: 'Monitor froze' } as FinalRecoveryCaseDto;

function mockQueries(list: AdjudicationCaseDto[]) {
  cases.list.mockResolvedValue(ok(list));
  vi.mocked(incidentReportsService.listByEvent).mockResolvedValue(
    ok({
      eventId: EVENT_ID,
      reports: [report({}), report({ id: 'report-2', serialNumber: '8', athleteName: null })],
      requiredDecisionCount: 0,
      coveredDecisionCount: 0,
      uncoveredDecisions: [],
    }),
  );
  vi.mocked(protestsService.list).mockResolvedValue(ok([protestFixture()]));
  vi.mocked(scoringDecisionsService.listByEvent).mockResolvedValue(ok({ decisions: [decision] }));
  vi.mocked(finalRecoveriesService.listByEvent).mockResolvedValue(ok([recovery]));
  vi.mocked(rangeInterruptionsService.listByScope).mockResolvedValue(ok([interruptionFixture()]));
  vi.mocked(targetExaminationsService.listByScope).mockResolvedValue(ok([examinationFixture()]));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fill(placeholder: string, value: string, container: HTMLElement = document.body) {
  fireEvent.change(within(container).getByPlaceholderText(placeholder), { target: { value } });
}

function detail(): HTMLElement {
  const heading = screen.getByRole('heading', { level: 3 });
  const element = heading.closest('div.space-y-4');
  if (!(element instanceof HTMLElement)) throw new Error('Case detail not found');
  return element;
}

function createForm(): HTMLElement {
  const form = screen.getByText('Open an optional case file').closest('form');
  if (!form) throw new Error('Create form not found');
  return form;
}

const errorBanner = () => document.querySelector('p.border-l-2.border-vscode-error');

async function renderPanel() {
  render(<AdjudicationCasesPanel eventId={EVENT_ID} />);
  await screen.findByRole('heading', { level: 3 });
}

describe('AdjudicationCasesPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockQueries([
      adjudicationCase(),
      adjudicationCase({ id: SECOND_ID, subject: 'Second case', category: 'SCORING', status: 'REFERRED' }),
    ]);
  });

  it('queries the event, lists every case and selects the first one', async () => {
    await renderPanel();

    expect(cases.list).toHaveBeenCalledWith({ scopeType: 'EVENT', scopeId: EVENT_ID });
    expect(incidentReportsService.listByEvent).toHaveBeenCalledWith({ eventId: EVENT_ID });
    expect(protestsService.list).toHaveBeenCalledWith({ scopeType: 'EVENT', scopeId: EVENT_ID });
    expect(scoringDecisionsService.listByEvent).toHaveBeenCalledWith({ eventId: EVENT_ID });
    expect(finalRecoveriesService.listByEvent).toHaveBeenCalledWith({ eventId: EVENT_ID });
    expect(rangeInterruptionsService.listByScope).toHaveBeenCalledWith({ scopeType: 'EVENT', scopeId: EVENT_ID });
    expect(targetExaminationsService.listByScope).toHaveBeenCalledWith({ scopeType: 'EVENT', scopeId: EVENT_ID });
    expect(screen.getByRole('button', { name: 'First case RANGE_INCIDENT · OPEN · 0 links' })).toHaveClass(
      'bg-vscode-highlight',
    );
    expect(screen.getByRole('button', { name: 'Second case SCORING · REFERRED · 0 links' })).toHaveClass(
      'hover:bg-vscode-bg-hover',
    );
    expect(within(detail()).getByRole('heading', { name: 'First case' })).toBeInTheDocument();
    expect(within(detail()).getByText('Target carrier stopped during relay 2')).toBeInTheDocument();
    expect(screen.queryByText('No case files.')).not.toBeInTheDocument();
  });

  it('offers the official records of the event that the case does not link yet', async () => {
    mockQueries([
      adjudicationCase({
        links: [
          {
            id: LINK_ID,
            caseId: FIRST_ID,
            operation: 'ADD',
            artifactType: 'PROTEST',
            artifactId: protestFixture().id,
            relation: 'PROTEST',
            labelSnapshot: 'Linked protest',
            statement: 'Protest concerns this incident',
            officialName: 'Jury Member',
            recordedAt: '2026-11-16T01:05:00.000Z',
            reversesLinkId: null,
          },
        ],
      }),
    ]);
    await renderPanel();

    const select = within(detail()).getAllByRole('combobox')[0] as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Select an official record',
      'IR 7 · Alex Athlete',
      'IR 8 · General range incident',
      'ATHLETE_NON_FAULT · Athlete stopped through no fault',
      'NO_SHOT_INDICATION · Expected shot was not shown',
      'DEDUCTION · Two points deducted',
      'EST_FAILURE · Monitor froze',
    ]);
    expect(within(detail()).getByText('Linked protest')).toBeInTheDocument();
    expect(within(detail()).getByText('PROTEST · PROTEST · Protest concerns this incident')).toBeInTheDocument();
  });

  it('keeps the selected case on refresh and selects the first case when it disappears', async () => {
    await renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /^Second case/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(cases.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    expect(within(detail()).getByRole('heading', { name: 'Second case' })).toBeInTheDocument();

    cases.list.mockResolvedValue(ok([adjudicationCase({ id: CREATED_ID, subject: 'Remaining case' })]));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await within(document.body).findByRole('heading', { name: 'Remaining case' })).toBeInTheDocument();
  });

  it('shows the empty text only after loading and disables refresh while loading', async () => {
    const pending = deferred<ReturnType<typeof ok<AdjudicationCaseDto[]>>>();
    cases.list.mockReturnValueOnce(pending.promise);
    render(<AdjudicationCasesPanel eventId={EVENT_ID} />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(screen.queryByText('No case files.')).not.toBeInTheDocument();

    await act(async () => pending.resolve(ok([])));

    expect(screen.getByText('No case files.')).toHaveClass('p-3 text-xs text-vscode-text-muted');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it.each([
    ['the case list', () => cases.list.mockResolvedValue(fail('Case ledger unavailable')), 'Case ledger unavailable'],
    [
      'the target examinations',
      () => vi.mocked(targetExaminationsService.listByScope).mockResolvedValue(fail('Examinations unavailable')),
      'Examinations unavailable',
    ],
    ['a rejected query', () => cases.list.mockRejectedValue('bridge closed'), 'bridge closed'],
  ])('shows a failed load of %s in the panel error', async (_name, failQuery, message) => {
    failQuery();
    render(<AdjudicationCasesPanel eventId={EVENT_ID} />);

    await screen.findByText(message);
    expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`));
    expect(errorBanner()).toHaveAttribute('class', 'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error');
    expect(errorBanner()).not.toHaveAttribute('role');
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('does not submit the case form from its Open case button', async () => {
    await renderPanel();
    const form = createForm();
    fill('Subject', 'Protest file', form);
    fill('Summary', 'Written protest lodged', form);
    fill('Official name', 'Jury Member', form);
    const button = within(form).getByRole('button', { name: 'Open case' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('type', 'button');

    fireEvent.click(button);

    expect(cases.create).not.toHaveBeenCalled();
  });

  it('opens a case on form submission, selects it and keeps the category and official name', async () => {
    const created = adjudicationCase({ id: CREATED_ID, subject: 'Protest file', category: 'PROTEST' });
    const pending = deferred<ReturnType<typeof ok<AdjudicationCaseDto>>>();
    cases.create.mockReturnValueOnce(pending.promise);
    await renderPanel();
    const form = createForm();
    fireEvent.change(within(form).getByRole('combobox'), { target: { value: 'PROTEST' } });
    fill('Subject', 'Protest file', form);
    fill('Summary', 'Written protest lodged', form);
    fill('Official name', 'Jury Member', form);
    fireEvent.submit(form);

    expect(cases.create).toHaveBeenCalledWith({
      scopeType: 'EVENT',
      scopeId: EVENT_ID,
      category: 'PROTEST',
      subject: 'Protest file',
      summary: 'Written protest lodged',
      openedBy: 'Jury Member',
    });
    expect(within(form).getByRole('button', { name: 'Open case' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

    await act(async () => pending.resolve(ok(created)));

    expect(screen.getByRole('button', { name: 'Protest file PROTEST · OPEN · 0 links' })).toHaveClass(
      'bg-vscode-highlight',
    );
    expect(within(detail()).getByRole('heading', { name: 'Protest file' })).toBeInTheDocument();
    expect(within(form).getByPlaceholderText('Subject')).toHaveValue('');
    expect(within(form).getByPlaceholderText('Summary')).toHaveValue('');
    expect(within(form).getByPlaceholderText('Official name')).toHaveValue('Jury Member');
    expect(within(form).getByRole('combobox')).toHaveValue('PROTEST');
    expect(cases.list).toHaveBeenCalledTimes(1);
  });

  it('shows a failed case opening in the panel error and keeps the draft', async () => {
    cases.create.mockResolvedValueOnce(fail('Subject already used'));
    await renderPanel();
    const form = createForm();
    fill('Subject', 'Protest file', form);
    fill('Summary', 'Written protest lodged', form);
    fill('Official name', 'Jury Member', form);
    fireEvent.submit(form);

    await screen.findByText('Subject already used');
    expect(errorBanner()).toHaveTextContent(/^Subject already used$/);
    expect(within(form).getByPlaceholderText('Subject')).toHaveValue('Protest file');
    expect(within(form).getByRole('button', { name: 'Open case' })).toBeEnabled();
  });

  it('appends an entry, replaces the case and resets an entry type the new status no longer allows', async () => {
    const resolved = adjudicationCase({ status: 'RESOLVED' });
    const pending = deferred<ReturnType<typeof ok<AdjudicationCaseDto>>>();
    cases.appendEntry.mockReturnValueOnce(pending.promise);
    await renderPanel();
    const view = detail();
    const entryTypeSelect = () => within(view).getAllByRole('combobox')[1] as HTMLSelectElement;
    expect([...entryTypeSelect().options].map((option) => option.value)).toEqual([
      'NOTE',
      'REFERRED',
      'RESOLVED',
      'VOID',
    ]);
    fireEvent.change(entryTypeSelect(), { target: { value: 'REFERRED' } });
    fill('Official name', 'Jury Member', view);
    fill('Statement / link reason', 'Referred to the Jury', view);
    fill('Rule reference (optional)', 'ISSF 6.16', view);
    fireEvent.click(within(view).getByRole('button', { name: 'Append case entry' }));

    expect(cases.appendEntry).toHaveBeenCalledWith({
      caseId: FIRST_ID,
      type: 'REFERRED',
      statement: 'Referred to the Jury',
      officialName: 'Jury Member',
      ruleReference: 'ISSF 6.16',
    });
    expect(within(view).getByRole('button', { name: 'Append case entry' })).toBeDisabled();

    await act(async () => pending.resolve(ok(resolved)));

    expect(screen.getByRole('button', { name: 'First case RANGE_INCIDENT · RESOLVED · 0 links' })).toBeInTheDocument();
    expect(within(detail()).getByText('RESOLVED')).toBeInTheDocument();
    expect(entryTypeSelect()).toHaveValue('NOTE');
    expect([...entryTypeSelect().options].map((option) => option.value)).toEqual([
      'NOTE',
      'CLOSED',
      'REOPENED',
      'VOID',
    ]);
    expect(within(view).getByPlaceholderText('Statement / link reason')).toHaveValue('');
    expect(within(view).getByPlaceholderText('Rule reference (optional)')).toHaveValue('');
    expect(within(view).getByPlaceholderText('Official name')).toHaveValue('Jury Member');
    expect(cases.list).toHaveBeenCalledTimes(1);
  });

  it('sends no rule reference when it is blank', async () => {
    cases.appendEntry.mockResolvedValueOnce(ok(adjudicationCase()));
    await renderPanel();
    const view = detail();
    fill('Official name', 'Jury Member', view);
    fill('Statement / link reason', 'Note for the file', view);
    fill('Rule reference (optional)', '   ', view);
    fireEvent.click(within(view).getByRole('button', { name: 'Append case entry' }));

    await waitFor(() =>
      expect(cases.appendEntry).toHaveBeenCalledWith({
        caseId: FIRST_ID,
        type: 'NOTE',
        statement: 'Note for the file',
        officialName: 'Jury Member',
      }),
    );
  });

  it.each([
    ['a failed response', () => cases.appendEntry.mockResolvedValueOnce(fail('Case is void')), 'Case is void'],
    [
      'a failed response without an error',
      () => cases.appendEntry.mockResolvedValueOnce({ success: false } as never),
      'Case operation failed',
    ],
    [
      'a success without the changed case',
      () => cases.appendEntry.mockResolvedValueOnce({ success: true } as never),
      'Case operation failed',
    ],
    ['a rejected command', () => cases.appendEntry.mockRejectedValueOnce('bridge closed'), 'bridge closed'],
  ])('shows %s of a case command in the panel error and keeps the draft', async (_name, failCommand, message) => {
    failCommand();
    await renderPanel();
    const view = detail();
    fill('Official name', 'Jury Member', view);
    fill('Statement / link reason', 'Note for the file', view);
    fireEvent.click(within(view).getByRole('button', { name: 'Append case entry' }));

    await screen.findByText(message);
    expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`));
    expect(within(view).getByPlaceholderText('Statement / link reason')).toHaveValue('Note for the file');
    expect(within(view).getByRole('button', { name: 'Append case entry' })).toBeEnabled();
  });

  it('links a selected record and clears the record choice and statement', async () => {
    const linked = adjudicationCase({
      links: [
        {
          id: LINK_ID,
          caseId: FIRST_ID,
          operation: 'ADD',
          artifactType: 'SCORING_DECISION',
          artifactId: 'decision-1',
          relation: 'DECISION',
          labelSnapshot: 'DEDUCTION · Two points deducted',
          statement: 'Penalty decided for this incident',
          officialName: 'Jury Member',
          recordedAt: '2026-11-16T01:05:00.000Z',
          reversesLinkId: null,
        },
      ],
    });
    cases.linkArtifact.mockResolvedValueOnce(ok(linked));
    await renderPanel();
    const view = detail();
    const recordSelect = () => within(view).getAllByRole('combobox')[0] as HTMLSelectElement;
    expect(within(view).getByRole('button', { name: 'Link record' })).toBeDisabled();
    fireEvent.change(recordSelect(), { target: { value: 'SCORING_DECISION:decision-1' } });
    fill('Official name', 'Jury Member', view);
    fill('Statement / link reason', 'Penalty decided for this incident', view);
    fireEvent.click(within(view).getByRole('button', { name: 'Link record' }));

    await within(view).findByText('SCORING_DECISION · DECISION · Penalty decided for this incident');
    expect(cases.linkArtifact).toHaveBeenCalledWith({
      caseId: FIRST_ID,
      artifactType: 'SCORING_DECISION',
      artifactId: 'decision-1',
      relation: 'DECISION',
      labelSnapshot: 'DEDUCTION · Two points deducted',
      statement: 'Penalty decided for this incident',
      officialName: 'Jury Member',
    });
    expect(recordSelect()).toHaveValue('');
    expect([...recordSelect().options].map((option) => option.textContent)).not.toContain(
      'DEDUCTION · Two points deducted',
    );
    expect(within(view).getByPlaceholderText('Statement / link reason')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'First case RANGE_INCIDENT · OPEN · 1 links' })).toBeInTheDocument();
  });

  it('unlinks a record with the official name and statement', async () => {
    const withLink = adjudicationCase({
      links: [
        {
          id: LINK_ID,
          caseId: FIRST_ID,
          operation: 'ADD',
          artifactType: 'PROTEST',
          artifactId: protestFixture().id,
          relation: 'PROTEST',
          labelSnapshot: 'Linked protest',
          statement: 'Protest concerns this incident',
          officialName: 'Jury Member',
          recordedAt: '2026-11-16T01:05:00.000Z',
          reversesLinkId: null,
        },
      ],
    });
    mockQueries([withLink]);
    cases.unlinkArtifact.mockResolvedValueOnce(ok(adjudicationCase()));
    await renderPanel();
    const view = detail();
    expect(within(view).getByRole('button', { name: 'Unlink' })).toBeDisabled();
    fill('Official name', 'Jury Member', view);
    fill('Statement / link reason', 'Linked by mistake', view);
    fireEvent.click(within(view).getByRole('button', { name: 'Unlink' }));

    await within(view).findByText('No artifacts linked.');
    expect(cases.unlinkArtifact).toHaveBeenCalledWith({
      caseId: FIRST_ID,
      linkId: LINK_ID,
      statement: 'Linked by mistake',
      officialName: 'Jury Member',
    });
  });

  it('keeps the detail draft when another case is selected', async () => {
    await renderPanel();
    fill('Official name', 'Jury Member', detail());
    fill('Statement / link reason', 'Draft for the first case', detail());
    fill('Rule reference (optional)', 'ISSF 6.16', detail());

    fireEvent.click(screen.getByRole('button', { name: /^Second case/ }));

    const view = detail();
    expect(within(view).getByRole('heading', { name: 'Second case' })).toBeInTheDocument();
    expect(within(view).getByPlaceholderText('Official name')).toHaveValue('Jury Member');
    expect(within(view).getByPlaceholderText('Statement / link reason')).toHaveValue('Draft for the first case');
    expect(within(view).getByPlaceholderText('Rule reference (optional)')).toHaveValue('ISSF 6.16');
  });

  it.each(['CLOSED', 'VOID'] as const)('hides the link controls of a %s case', async (status) => {
    mockQueries([adjudicationCase({ status })]);
    await renderPanel();
    const view = detail();

    expect(within(view).queryByRole('button', { name: 'Link record' })).not.toBeInTheDocument();
    fill('Official name', 'Jury Member', view);
    fill('Statement / link reason', 'Note for the file', view);
    expect(within(view).getByRole('button', { name: 'Append case entry' }).hasAttribute('disabled')).toBe(
      status === 'VOID',
    );
    expect([...(within(view).getByRole('combobox') as HTMLSelectElement).options].map((o) => o.value)).toEqual(
      status === 'VOID' ? ['NOTE'] : ['NOTE', 'REOPENED'],
    );
  });
});
