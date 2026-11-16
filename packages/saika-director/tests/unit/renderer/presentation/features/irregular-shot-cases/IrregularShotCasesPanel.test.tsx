import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FinalSeriesAdjudicationCapability } from '@sasakiuri/saika-rules';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IrregularShotCasesPanel } from '@/renderer/presentation/features/irregular-shot-cases/IrregularShotCasesPanel';
import { incidentReportsService, irregularShotCasesService, scoringDecisionsService } from '@/renderer/services';
import type { IrregularShotCaseDto, RangeIncidentReportDto, ScoringDecisionDto } from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { list, create, addEvidence, appendEntry } = vi.mocked(irregularShotCasesService);

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const COMPETITION_ID = '22222222-2222-4222-8222-222222222222';
const LANE_ID = '33333333-3333-4333-8333-333333333333';
const SUMMARY = 'Two shots registered on FP 1 at the same time';

function irregularCase(status: IrregularShotCaseDto['status']): IrregularShotCaseDto {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    eventId: EVENT_ID,
    competitionId: COMPETITION_ID,
    resultScope: 'QUALIFICATION',
    kind: 'CROSS_FIRE',
    subjectLaneId: LANE_ID,
    adjacentLaneIds: [],
    windowStartAt: '2026-11-16T01:00:00.000Z',
    windowEndAt: '2026-11-16T01:00:30.000Z',
    summary: SUMMARY,
    ruleReference: 'ISSF 6.11.6',
    openedBy: 'Jury Member',
    occurredAt: '2026-11-16T01:00:10.000Z',
    createdAt: '2026-11-16T01:01:00.000Z',
    status,
    publicationBlocked: true,
    timeline: [],
    evidence: [],
    entries: [],
  };
}

function renderPanel() {
  render(
    <IrregularShotCasesPanel
      eventId={EVENT_ID}
      competitionId={COMPETITION_ID}
      resultScope="QUALIFICATION"
      lanes={[{ laneId: LANE_ID, label: 'FP 1' }]}
    />,
  );
}

async function caseCard(): Promise<HTMLElement> {
  const card = (await screen.findByText(SUMMARY)).closest('section');
  if (!card) throw new Error('Case card not found');
  return card;
}

function fillOfficialAndStatement(card: HTMLElement, statement: string) {
  fireEvent.change(within(card).getByLabelText('Official name'), { target: { value: 'Jury Member' } });
  fireEvent.change(within(card).getByLabelText('Statement'), { target: { value: statement } });
}

describe('IrregularShotCasesPanel case actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(incidentReportsService.listByEvent).mockResolvedValue(
      ok({ eventId: EVENT_ID, reports: [], requiredDecisionCount: 0, coveredDecisionCount: 0, uncoveredDecisions: [] }),
    );
    vi.mocked(scoringDecisionsService.listByEvent).mockResolvedValue(ok({ decisions: [] }));
  });

  it('submits an action the new case status allows after a status change', async () => {
    list.mockResolvedValue(ok([irregularCase('OPEN')]));
    appendEntry.mockResolvedValueOnce(ok(irregularCase('REFERRED')));
    appendEntry.mockResolvedValueOnce(ok(irregularCase('REFERRED')));
    renderPanel();
    const card = await caseCard();

    fireEvent.change(within(card).getByLabelText('Case action'), { target: { value: 'REFERRED' } });
    fillOfficialAndStatement(card, 'Referred to the Jury');
    fireEvent.click(within(card).getByRole('button', { name: 'Append case action' }));
    await within(card).findByText(/^REFERRED/);

    expect(within(card).getByLabelText('Case action')).toHaveValue('NOTE');
    fireEvent.change(within(card).getByLabelText('Statement'), { target: { value: 'Jury is reviewing the video' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Append case action' }));

    await waitFor(() => expect(appendEntry).toHaveBeenCalledTimes(2));
    expect(appendEntry.mock.calls[1]?.[0]).toMatchObject({ type: 'NOTE', statement: 'Jury is reviewing the video' });
  });

  it('disables appending a case action on a void case', async () => {
    list.mockResolvedValue(ok([irregularCase('VOID')]));
    renderPanel();
    const card = await caseCard();

    fillOfficialAndStatement(card, 'Recorded after the case was voided');

    expect(within(card).getByRole('button', { name: 'Append case action' })).toBeDisabled();
  });
});

const OTHER_LANE_ID = '55555555-5555-4555-8555-555555555555';
const THIRD_LANE_ID = '66666666-6666-4666-8666-666666666666';
const OBSERVATION_ID = '77777777-7777-4777-8777-777777777777';
const REPORT_ID = '88888888-8888-4888-8888-888888888888';
const DECISION_ID = '99999999-9999-4999-8999-999999999999';
const LANES = [
  { laneId: LANE_ID, label: 'FP 1' },
  { laneId: OTHER_LANE_ID, label: 'FP 2' },
  { laneId: THIRD_LANE_ID, label: 'FP 3' },
];
const ADJUDICATION: FinalSeriesAdjudicationCapability = {
  incidents: [
    {
      kind: 'READY_POSITION',
      label: 'Ready position',
      ruleReference: 'ISSF 6.17.1.8',
      reviewGuidance: ['Compare the video with the commands'],
      warningBeforePenalty: true,
      consequences: [
        { when: 'FIRST_VIOLATION', action: 'DEDUCT', amount: 1, unit: 'HITS', sourceShotTreatment: 'MISS' },
        { when: 'SECOND_OR_LATER', action: 'DISQUALIFY', classification: 'DSQ' },
      ],
    },
  ],
};

function timelineCase(overrides: Partial<IrregularShotCaseDto> = {}): IrregularShotCaseDto {
  return {
    ...irregularCase('OPEN'),
    timeline: [
      {
        observationId: OBSERVATION_ID,
        shotId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        laneId: OTHER_LANE_ID,
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        stageIndex: 0,
        seriesIndex: 1,
        shotNumberInSeries: 4,
        mode: 'MATCH',
        effectiveScoreX10: 104,
        firedAt: '2026-11-16T01:00:05.000Z',
        receivedAt: '2026-11-16T01:00:05.100Z',
        scored: true,
        isRecorded: true,
        isReplay: false,
      },
    ],
    ...overrides,
  };
}

const report = (overrides: Partial<RangeIncidentReportDto>) =>
  ({
    id: REPORT_ID,
    serialNumber: '12',
    details: 'Crossfire reported by FP 2',
    voided: false,
    ...overrides,
  }) as RangeIncidentReportDto;
const decision = (overrides: Partial<ScoringDecisionDto>) =>
  ({
    id: DECISION_ID,
    type: 'ANNUL_SHOT',
    publicRemark: 'Shot annulled on FP 2',
    active: true,
    sourceCompetitionId: COMPETITION_ID,
    ...overrides,
  }) as ScoringDecisionDto;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderWorkspace(props: Partial<Parameters<typeof IrregularShotCasesPanel>[0]> = {}) {
  render(
    <IrregularShotCasesPanel
      eventId={EVENT_ID}
      competitionId={COMPETITION_ID}
      resultScope="FINAL"
      lanes={LANES}
      {...props}
    />,
  );
}

function createSection(): HTMLElement {
  const section = screen.getByText('Open a review case').closest('section');
  if (!section) throw new Error('Create section not found');
  return section;
}

const errorBanner = () => document.querySelector('div.border-l-2.border-vscode-error');

function fillCreateForm() {
  const section = createSection();
  fireEvent.change(within(section).getByLabelText('Reporting official'), { target: { value: ' Range Officer ' } });
  fireEvent.change(within(section).getByLabelText('Initial observation'), { target: { value: ' Two hits on FP 1 ' } });
  return section;
}

describe('IrregularShotCasesPanel workspace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    list.mockResolvedValue(
      ok([
        timelineCase(),
        {
          ...irregularCase('OPEN'),
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          competitionId: EVENT_ID,
          summary: 'Other competition',
        },
      ]),
    );
    vi.mocked(incidentReportsService.listByEvent).mockResolvedValue(
      ok({
        eventId: EVENT_ID,
        reports: [report({}), report({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', serialNumber: '13', voided: true })],
        requiredDecisionCount: 0,
        coveredDecisionCount: 0,
        uncoveredDecisions: [],
      }),
    );
    vi.mocked(scoringDecisionsService.listByEvent).mockResolvedValue(
      ok({
        decisions: [
          decision({}),
          decision({
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            publicRemark: 'Event-wide warning',
            sourceCompetitionId: null,
            type: 'WARNING',
          }),
          decision({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', publicRemark: 'Inactive', active: false }),
          decision({ id: '12121212-1212-4121-8121-121212121212', publicRemark: 'Revoked', type: 'REVOCATION' }),
          decision({
            id: '13131313-1313-4131-8131-131313131313',
            publicRemark: 'Other competition',
            sourceCompetitionId: EVENT_ID,
          }),
        ],
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queries the event and shows only the cases of this competition', async () => {
    renderWorkspace();
    await caseCard();

    expect(list).toHaveBeenCalledWith({ eventId: EVENT_ID, resultScope: 'FINAL' });
    expect(incidentReportsService.listByEvent).toHaveBeenCalledWith({ eventId: EVENT_ID });
    expect(scoringDecisionsService.listByEvent).toHaveBeenCalledWith({ eventId: EVENT_ID, resultScope: 'FINAL' });
    expect(screen.queryByText('Other competition')).not.toBeInTheDocument();
    const card = await caseCard();
    expect(within(card).getByText('CROSS FIRE · FP 1')).toBeInTheDocument();
    expect(within(card).getByText('OPEN · publication held')).toHaveClass('text-xs font-semibold text-vscode-warning');
    expect(within(card).getByRole('row', { name: /FP 2/ })).toHaveTextContent(/^.+FP 22 \/ 410\.4Link$/);
  });

  it('offers the open reports and the active decisions of this competition for a resolution', async () => {
    renderWorkspace();
    const card = await caseCard();
    fireEvent.change(within(card).getByLabelText('Case action'), { target: { value: 'RESOLVED' } });

    const reports = within(card).getByLabelText('Range Incident Report') as HTMLSelectElement;
    expect([...reports.options].map((option) => option.textContent)).toEqual([
      'Select report',
      '12 · Crossfire reported by FP 2',
    ]);
    expect(
      within(card)
        .getAllByRole('checkbox')
        .map((box) => box.parentElement?.textContent),
    ).toEqual(['ANNUL_SHOT · Shot annulled on FP 2', 'WARNING · Event-wide warning']);
  });

  it('shows the empty text only after loading and disables refresh while loading', async () => {
    const pending = deferred<ReturnType<typeof ok<IrregularShotCaseDto[]>>>();
    list.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(screen.queryByText('No cases for this competition.')).not.toBeInTheDocument();

    await act(async () => pending.resolve(ok([])));

    expect(screen.getByText('No cases for this competition.')).toHaveClass('text-xs text-vscode-text-muted');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it.each([
    ['the case list', () => list.mockResolvedValue(fail('Case ledger unavailable')), 'Case ledger unavailable'],
    [
      'the scoring decisions',
      () => vi.mocked(scoringDecisionsService.listByEvent).mockResolvedValue(fail('Decisions unavailable')),
      'Decisions unavailable',
    ],
    ['a rejected query', () => list.mockRejectedValue('bridge closed'), 'bridge closed'],
  ])('shows a failed load of %s in the panel error', async (_name, failQuery, message) => {
    failQuery();
    renderWorkspace();

    await screen.findByText(message);
    expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`));
    expect(errorBanner()).toHaveAttribute('class', 'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error');
    expect(errorBanner()).not.toHaveAttribute('role');
    expect(screen.queryByText(SUMMARY)).not.toBeInTheDocument();
  });

  it('defaults the case form and follows the case type with its rule reference and guidance', async () => {
    renderWorkspace({ adjudication: ADJUDICATION });
    await caseCard();
    const section = createSection();

    expect(within(section).getByLabelText('Subject Lane')).toHaveValue(LANE_ID);
    expect(within(section).getByLabelText('ISSF rule reference')).toHaveValue('ISSF 6.11.6');
    expect((within(section).getByLabelText('Occurred at') as HTMLInputElement).value).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    );
    expect([...(within(section).getByLabelText('Case type') as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      'Crossfire',
      'Excess shots',
      'Disputed shot',
      'Ready position',
    ]);
    expect(
      within(section)
        .getAllByRole('checkbox')
        .map((box) => box.parentElement?.textContent),
    ).toEqual(['FP 2', 'FP 3']);

    fireEvent.change(within(section).getByLabelText('Case type'), { target: { value: 'EXCESS_SHOTS' } });
    expect(within(section).getByLabelText('ISSF rule reference')).toHaveValue('ISSF 6.11.5');
    expect(within(section).queryByText(/RulePack guidance/)).not.toBeInTheDocument();

    fireEvent.change(within(section).getByLabelText('Case type'), { target: { value: 'READY_POSITION' } });
    expect(within(section).getByLabelText('ISSF rule reference')).toHaveValue('ISSF 6.17.1.8');
    expect(within(section).getByText('RulePack guidance · ISSF 6.17.1.8')).toBeInTheDocument();
    expect(
      within(section)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Compare the video with the commands',
      'first violation: deduct 1 hits; source shot is MISS.',
      'second or later: disqualify (DSQ).',
    ]);

    fireEvent.change(within(section).getByLabelText('Subject Lane'), { target: { value: OTHER_LANE_ID } });
    expect(
      within(section)
        .getAllByRole('checkbox')
        .map((box) => box.parentElement?.textContent),
    ).toEqual(['FP 1', 'FP 3']);
  });

  it('opens a case with trimmed fields, appends its card and clears only the observation', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T01:00:00.000Z'));
    const created = {
      ...irregularCase('OPEN'),
      id: 'abababab-abab-4bab-8bab-abababababab',
      summary: 'Two hits on FP 1',
    };
    const pending = deferred<ReturnType<typeof ok<IrregularShotCaseDto>>>();
    create.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    await caseCard();
    const section = createSection();
    const button = within(section).getByRole('button', { name: 'Open case and hold official publication' });
    expect(button).toBeDisabled();
    fireEvent.click(within(section).getByLabelText('FP 3'));
    fireEvent.change(within(section).getByLabelText('ISSF rule reference'), { target: { value: ' ISSF 6.11.6 ' } });
    fillCreateForm();
    fireEvent.click(button);

    expect(create).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      competitionId: COMPETITION_ID,
      resultScope: 'FINAL',
      kind: 'CROSS_FIRE',
      subjectLaneId: LANE_ID,
      adjacentLaneIds: [THIRD_LANE_ID],
      windowStartAt: '2026-11-16T00:59:00.000Z',
      windowEndAt: '2026-11-16T01:00:00.000Z',
      summary: 'Two hits on FP 1',
      ruleReference: 'ISSF 6.11.6',
      openedBy: 'Range Officer',
      occurredAt: '2026-11-16T01:00:00.000Z',
    });
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();

    await act(async () => pending.resolve(ok(created)));

    expect(screen.getAllByText('Two hits on FP 1')).toHaveLength(1);
    expect(within(section).getByLabelText('Initial observation')).toHaveValue('');
    expect(within(section).getByLabelText('Reporting official')).toHaveValue(' Range Officer ');
    expect(within(section).getByLabelText('FP 3')).toBeChecked();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('shows a failed case opening in the panel error and keeps the draft', async () => {
    create.mockResolvedValueOnce(fail('Window too long'));
    renderWorkspace();
    await caseCard();
    const section = fillCreateForm();
    fireEvent.click(within(section).getByRole('button', { name: 'Open case and hold official publication' }));

    await screen.findByText('Window too long');
    expect(errorBanner()).toHaveTextContent(/^Window too long$/);
    expect(within(section).getByLabelText('Initial observation')).toHaveValue(' Two hits on FP 1 ');
  });

  it('keeps the case form disabled while the panel is disabled', async () => {
    renderWorkspace({ disabled: true });
    const card = await caseCard();
    const section = fillCreateForm();
    fillOfficialAndStatement(card, 'Note');

    expect(within(section).getByRole('button', { name: 'Open case and hold official publication' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Append case action' })).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Link' })).toBeDisabled();
  });

  it('keeps a draft in its own case card, also through a refresh', async () => {
    const second = { ...irregularCase('OPEN'), id: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', summary: 'Second case' };
    list.mockResolvedValue(ok([timelineCase(), second]));
    renderWorkspace();
    const card = await caseCard();
    fillOfficialAndStatement(card, 'Draft for the first case');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());

    expect(within(await caseCard()).getByLabelText('Statement')).toHaveValue('Draft for the first case');
    const secondCard = screen.getByText('Second case').closest('section') as HTMLElement;
    expect(within(secondCard).getByLabelText('Statement')).toHaveValue('');
    expect(within(secondCard).getByLabelText('Official name')).toHaveValue('');
  });

  it('links a shot as evidence with the chosen relation and shows it as linked', async () => {
    const linked = timelineCase({
      evidence: [
        {
          id: 'acacacac-acac-4cac-8cac-acacacacacac',
          caseId: irregularCase('OPEN').id,
          relation: 'POSSIBLE_SOURCE',
          observationId: OBSERVATION_ID,
          shotId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          laneId: OTHER_LANE_ID,
          sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          stageIndex: 0,
          seriesIndex: 1,
          shotNumberInSeries: 4,
          mode: 'MATCH',
          effectiveScoreX10: 104,
          firedAt: '2026-11-16T01:00:05.000Z',
          receivedAt: '2026-11-16T01:00:05.100Z',
          statement: 'Linked',
          officialName: 'Jury Member',
          recordedAt: '2026-11-16T01:02:00.000Z',
        },
      ],
    });
    addEvidence.mockResolvedValueOnce(ok(linked));
    renderWorkspace();
    const card = await caseCard();
    expect(within(card).getByRole('button', { name: 'Link' })).toBeDisabled();
    fireEvent.change(within(card).getByLabelText('Evidence relation'), { target: { value: 'POSSIBLE_SOURCE' } });
    fireEvent.change(within(card).getByLabelText('Official name'), { target: { value: ' Jury Member ' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Link' }));

    await within(card).findByRole('button', { name: 'Linked' });
    expect(addEvidence).toHaveBeenCalledWith({
      caseId: irregularCase('OPEN').id,
      observationId: OBSERVATION_ID,
      relation: 'POSSIBLE_SOURCE',
      officialName: 'Jury Member',
    });
    expect(within(card).getByRole('button', { name: 'Linked' })).toBeDisabled();
    fireEvent.change(within(card).getByLabelText('Evidence relation'), { target: { value: 'CONTEXT' } });
    expect(within(card).getByRole('button', { name: 'Link' })).toBeEnabled();
  });

  it('records a resolution with its report and decisions and clears the statement', async () => {
    const resolved = { ...timelineCase(), status: 'RESOLVED' as const };
    const pending = deferred<ReturnType<typeof ok<IrregularShotCaseDto>>>();
    appendEntry.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    const card = await caseCard();
    fireEvent.change(within(card).getByLabelText('Case action'), { target: { value: 'RESOLVED' } });
    fireEvent.change(within(card).getByLabelText('Jury resolution'), { target: { value: 'SHOT_ANNULLED' } });
    fillOfficialAndStatement(card, ' Crossfire confirmed ');
    const button = within(card).getByRole('button', { name: 'Append case action' });
    expect(button).toBeDisabled();
    fireEvent.change(within(card).getByLabelText('Range Incident Report'), { target: { value: REPORT_ID } });
    expect(button).toBeDisabled();
    fireEvent.click(within(card).getByLabelText('ANNUL_SHOT · Shot annulled on FP 2'));
    fireEvent.click(button);

    expect(appendEntry).toHaveBeenCalledWith({
      caseId: irregularCase('OPEN').id,
      type: 'RESOLVED',
      statement: 'Crossfire confirmed',
      officialName: 'Jury Member',
      resolutionCode: 'SHOT_ANNULLED',
      incidentReportId: REPORT_ID,
      scoringDecisionIds: [DECISION_ID],
    });
    expect(button).toBeDisabled();
    expect(within(card).getByRole('button', { name: 'Link' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();

    await act(async () => pending.resolve(ok(resolved)));

    expect(within(card).getByText(/^RESOLVED/)).toBeInTheDocument();
    expect(within(card).getByLabelText('Statement')).toHaveValue('');
    expect(within(card).getByLabelText('Official name')).toHaveValue('Jury Member');
    expect(within(card).getByLabelText('Case action')).toHaveValue('NOTE');
  });

  it('records a resolution without a score change without decisions', async () => {
    appendEntry.mockResolvedValueOnce(ok(timelineCase()));
    renderWorkspace();
    const card = await caseCard();
    fireEvent.change(within(card).getByLabelText('Case action'), { target: { value: 'RESOLVED' } });
    fireEvent.change(within(card).getByLabelText('Range Incident Report'), { target: { value: REPORT_ID } });
    fillOfficialAndStatement(card, 'No score change');
    fireEvent.click(within(card).getByRole('button', { name: 'Append case action' }));

    await waitFor(() =>
      expect(appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          resolutionCode: 'NO_SCORE_CHANGE',
          incidentReportId: REPORT_ID,
          scoringDecisionIds: [],
        }),
      ),
    );
  });

  it.each([
    ['a failed response', () => appendEntry.mockResolvedValueOnce(fail('Case is closed')), 'Case is closed'],
    [
      'a failed response without an error',
      () => appendEntry.mockResolvedValueOnce({ success: false } as never),
      'Operation failed',
    ],
    [
      'a success without the changed case',
      () => appendEntry.mockResolvedValueOnce({ success: true } as never),
      'Operation failed',
    ],
    ['a rejected command', () => appendEntry.mockRejectedValueOnce('bridge closed'), 'bridge closed'],
  ])('shows %s of a case command in the panel error and keeps the draft', async (_name, failCommand, message) => {
    failCommand();
    renderWorkspace();
    const card = await caseCard();
    fillOfficialAndStatement(card, 'Note for the file');
    fireEvent.click(within(card).getByRole('button', { name: 'Append case action' }));

    await screen.findByText(message);
    expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`));
    expect(within(card).getByLabelText('Statement')).toHaveValue('Note for the file');
    expect(within(card).getByRole('button', { name: 'Append case action' })).toBeEnabled();
  });
});
