import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinalRecoveryPanel } from '@/renderer/presentation/features/final-recoveries';
import { finalOperationsService, finalRecoveriesService } from '@/renderer/services';
import type { DirectorLaneSnapshotDto, FinalOperationRunDto, FinalRecoveryCaseDto } from '@/shared/ipc/contracts';
import type { CompetitionPhase } from '@sasakiuri/saika-protocol/CompetitionState';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const recoveries = vi.mocked(finalRecoveriesService);
const operations = vi.mocked(finalOperationsService);

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';
const LANE_A = '44444444-4444-4444-8444-444444444444';
const LANE_B = '55555555-5555-4555-8555-555555555555';
const LANE_C = '66666666-6666-4666-8666-666666666666';
const UNKNOWN_LANE = '99999999-9999-4999-8999-999999999999';
const FIRST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CREATED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Entry = FinalRecoveryCaseDto['entries'][number];
type CaseResponse = ReturnType<typeof ok<FinalRecoveryCaseDto>>;
type ListResponse = ReturnType<typeof ok<FinalRecoveryCaseDto[]>>;

function recoveryCase(overrides: Partial<FinalRecoveryCaseDto> = {}): FinalRecoveryCaseDto {
  return {
    allowanceSubject: null,
    id: FIRST_ID,
    competitionId: COMPETITION_ID,
    eventId: EVENT_ID,
    finalRunId: null,
    scriptStepId: null,
    scriptStepSnapshot: null,
    procedureProfile: 'RIFLE_PISTOL_10M_50M',
    incidentType: 'MALFUNCTION',
    phase: 'MATCH_SERIES',
    affectedLaneIds: [],
    summary: 'Rifle failed to fire.',
    openedBy: 'Jury A',
    occurredAt: '2026-11-16T01:00:00.000Z',
    createdAt: '2026-11-16T01:00:00.000Z',
    status: 'OPEN',
    guidance: {
      ruleReferences: ['6.13.2', '6.13.3'],
      checklist: ['Stop the clock.', 'Inspect the rifle.'],
      classifications: ['ALLOWABLE_MALFUNCTION', 'NON_ALLOWABLE_MALFUNCTION'],
      remedies: ['REPEAT_SINGLE_SHOT', 'CONTINUE'],
      limits: {
        malfunctionAllowancePerFinal: null,
        repairLimitSeconds: null,
        readyLimitSeconds: null,
        incorrectCommandAdditionalSeconds: null,
        longDelayThresholdSeconds: null,
        sightingTimeSeconds: null,
      },
    },
    entries: [],
    ...overrides,
  };
}

const secondCase = (overrides: Partial<FinalRecoveryCaseDto> = {}) =>
  recoveryCase({
    id: SECOND_ID,
    incidentType: 'EST_FAILURE',
    phase: 'SIGHTING',
    status: 'STOPPED',
    summary: 'Monitor froze.',
    ...overrides,
  });

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    caseId: FIRST_ID,
    type: 'NOTE',
    statement: 'Clock stopped.',
    officialName: 'Jury A',
    ruleReference: null,
    classification: null,
    remedy: null,
    remainingTimeSeconds: null,
    grantedTimeSeconds: null,
    shotCount: null,
    occurredAt: '2026-11-16T01:01:00.000Z',
    recordedAt: '2026-11-16T01:01:00.000Z',
    ...overrides,
  };
}

function lane(laneId: string, overrides: Partial<DirectorLaneSnapshotDto> = {}, maxShots = 5): DirectorLaneSnapshotDto {
  return {
    laneId,
    laneAlias: '',
    firingPointNumber: null,
    hardware: null,
    safetyState: null,
    rangeOfficerRequest: null,
    qualificationMalfunctionSignal: null,
    timedTargetState: null,
    qualificationRecoveryState: null,
    competitionState: {
      competitionId: COMPETITION_ID,
      laneId,
      sessionId: 'session-1',
      phase: 'MATCH',
      currentStage: { index: 0, name: 'Final', scored: true, totalSeries: 1 },
      currentSeries: { index: 0, shotsRecorded: 0, maxShots },
      publishedAt: '2026-11-16T01:00:00.000Z',
    },
    assignment: null,
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastQualificationRecoveryShot: null,
    lastSeenAt: '2026-11-16T01:00:00.000Z',
    ...overrides,
  };
}

const athlete = (laneId: string, name: string): DirectorLaneSnapshotDto['assignment'] => ({
  competitionId: COMPETITION_ID,
  laneId,
  athlete: { id: `${laneId.slice(0, 8)}-athlete`, startNumber: 1, name },
  assignedAt: '2026-11-16T00:50:00.000Z',
  publishedAt: '2026-11-16T00:50:00.000Z',
});

const lanes = [
  lane(LANE_A, { firingPointNumber: 3, assignment: athlete(LANE_A, 'Athlete A') }),
  lane(LANE_B, { laneAlias: 'West 4' }),
  lane(LANE_C),
];

function finalRun(purpose: 'SIGHTING' | 'MATCH' | 'SHOOT_OFF' = 'MATCH'): FinalOperationRunDto {
  return {
    id: RUN_ID,
    currentStep: {
      step: {
        id: 'STEP_7',
        actor: 'CRO',
        kind: 'COMMAND',
        text: 'Start',
        ruleReference: '6.17.1',
        timing: { mode: 'MANUAL' },
        effect: {
          type: 'OPEN_FIRING',
          purpose,
          participantSelection: 'ALL_ACTIVE',
          durationSeconds: 50,
        },
      },
    },
  } as unknown as FinalOperationRunDto;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface PanelProps {
  competitionTypeId?: string;
  phase?: CompetitionPhase;
  lanes?: readonly DirectorLaneSnapshotDto[];
  eventId?: string;
  disabled?: boolean;
}

function panel({ competitionTypeId = 'AR60_FINAL', phase = 'MATCH', ...props }: PanelProps = {}) {
  return (
    <FinalRecoveryPanel
      competitionId={COMPETITION_ID}
      competitionTypeId={competitionTypeId}
      phase={phase}
      lanes={props.lanes ?? lanes}
      {...(props.eventId === undefined ? {} : { eventId: props.eventId })}
      {...(props.disabled === undefined ? {} : { disabled: props.disabled })}
    />
  );
}

async function renderLoaded(props: PanelProps = {}) {
  const view = render(panel(props));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  return view;
}

const errorBanner = () => document.querySelector('p.border-l-2.border-vscode-error');
const createForm = () => screen.getByText('Open a recovery record').parentElement as HTMLElement;
const detail = () => screen.getByRole('heading', { level: 3 }).closest('div.space-y-4.p-4') as HTMLElement;
const row = (name: RegExp) => screen.getByRole('button', { name });
const optionTexts = (select: HTMLElement) =>
  [...(select as HTMLSelectElement).options].map((option) => option.textContent);
const identityInput = () => within(createForm()).getByLabelText(/^Athlete or team reference for manual operation/);

function fillCreate(summary = 'Pistol jammed.', official = 'Jury B') {
  fireEvent.change(within(createForm()).getByLabelText('Observed facts'), { target: { value: summary } });
  fireEvent.change(within(createForm()).getByLabelText('Opening official'), { target: { value: official } });
}

function fillAction(type: string, statement = 'Jury decided.', official = 'Jury C') {
  fireEvent.change(within(detail()).getByLabelText('Action'), { target: { value: type } });
  fireEvent.change(within(detail()).getByLabelText('Statement'), { target: { value: statement } });
  fireEvent.change(within(detail()).getByLabelText('Official'), { target: { value: official } });
}

describe('FinalRecoveryPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    recoveries.listByCompetition.mockResolvedValue(ok([recoveryCase(), secondCase()]));
    operations.getByCompetition.mockResolvedValue(ok(null));
  });

  describe('case list', () => {
    it('queries the cases and the Final run, lists the cases and selects the newest one', async () => {
      await renderLoaded();

      expect(recoveries.listByCompetition).toHaveBeenCalledWith({ competitionId: COMPETITION_ID });
      expect(operations.getByCompetition).toHaveBeenCalledWith({ competitionId: COMPETITION_ID });
      expect(row(/^Malfunction · Match series/)).toHaveTextContent(
        'Malfunction · Match seriesOPEN · Rifle failed to fire.',
      );
      expect(row(/^Est failure · Sighting/)).toHaveTextContent('Est failure · SightingSTOPPED · Monitor froze.');
      expect(row(/^Est failure · Sighting/)).toHaveAttribute(
        'class',
        'block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 bg-vscode-highlight',
      );
      expect(row(/^Malfunction · Match series/)).toHaveAttribute(
        'class',
        'block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 hover:bg-vscode-bg-hover',
      );
      expect(within(detail()).getByRole('heading', { name: 'Est failure' })).toBeInTheDocument();
      expect(screen.queryByText('No recovery cases.')).not.toBeInTheDocument();
    });

    it('keeps the selected case on refresh and falls back to the newest case when it disappears', async () => {
      await renderLoaded();
      fireEvent.click(row(/^Malfunction · Match series/));
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(recoveries.listByCompetition).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
      expect(within(detail()).getByRole('heading', { name: 'Malfunction' })).toBeInTheDocument();

      recoveries.listByCompetition.mockResolvedValue(
        ok([secondCase(), recoveryCase({ id: CREATED_ID, incidentType: 'INCORRECT_COMMAND' })]),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      expect(await screen.findByRole('heading', { level: 3, name: 'Incorrect command' })).toBeInTheDocument();
    });

    it('shows the empty text only after loading and leaves the case form usable while loading', async () => {
      const pending = deferred<ListResponse>();
      recoveries.listByCompetition.mockReturnValueOnce(pending.promise);
      render(panel());
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(screen.queryByText('No recovery cases.')).not.toBeInTheDocument();
      fillCreate();
      expect(within(createForm()).getByRole('button', { name: 'Open recovery case' })).toBeEnabled();

      await act(async () => pending.resolve(ok([])));

      expect(screen.getByText('No recovery cases.')).toHaveAttribute('class', 'p-3 text-xs text-vscode-text-muted');
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
      expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    });

    it.each([
      [
        'the case list',
        () => recoveries.listByCompetition.mockResolvedValue(fail('Recovery ledger unavailable')),
        'Recovery ledger unavailable',
      ],
      [
        'the Final run',
        () => operations.getByCompetition.mockResolvedValue(fail('Final run unavailable')),
        'Final run unavailable',
      ],
      [
        'both queries',
        () => {
          recoveries.listByCompetition.mockResolvedValue(fail('Recovery ledger unavailable'));
          operations.getByCompetition.mockResolvedValue(fail('Final run unavailable'));
        },
        'Recovery ledger unavailable',
      ],
      ['a rejected query', () => operations.getByCompetition.mockRejectedValue('bridge closed'), 'bridge closed'],
    ])('shows a failed load of %s in the panel error', async (_name, failQuery, message) => {
      failQuery();
      render(panel());

      await screen.findByText(message);
      expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`));
      expect(errorBanner()).toHaveAttribute('class', 'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error');
      expect(errorBanner()).not.toHaveAttribute('role');
      expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    });

    it('clears the load error on the next load', async () => {
      recoveries.listByCompetition.mockResolvedValueOnce(fail('Recovery ledger unavailable'));
      render(panel());
      await screen.findByText('Recovery ledger unavailable');

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

      await waitFor(() => expect(errorBanner()).toBeNull());
      expect(within(detail()).getByRole('heading', { name: 'Est failure' })).toBeInTheDocument();
    });
  });

  describe('opening a case', () => {
    it('offers every profile, incident and phase and labels the Lanes', async () => {
      await renderLoaded();
      const form = createForm();

      expect(optionTexts(within(form).getByLabelText('Procedure profile'))).toEqual([
        'Rifle pistol 10m 50m',
        'Rifle pistol 10m 50m mixed team',
        'Pistol 25m rapid fire',
        'Pistol 25m women',
        'General',
      ]);
      expect(optionTexts(within(form).getByLabelText('Incident'))).toEqual([
        'Malfunction',
        'Est failure',
        'Incorrect command',
        'Irregular case',
      ]);
      expect(optionTexts(within(form).getByLabelText('Final phase'))).toEqual([
        'Sighting',
        'Match single',
        'Match series',
        'Shoot off',
        'Other',
      ]);
      expect(within(form).getByRole('checkbox', { name: 'FP 3 · Athlete A' })).not.toBeChecked();
      expect(within(form).getByRole('checkbox', { name: 'West 4' })).toBeInTheDocument();
      expect(within(form).getByRole('checkbox', { name: LANE_C.slice(0, 8) })).toBeInTheDocument();
      expect(within(form).queryByText('No Lane is required for a range-wide record.')).not.toBeInTheDocument();
      expect(within(form).queryByText(/^Snapshot:/)).not.toBeInTheDocument();
    });

    it('notes that a range-wide record needs no Lane', async () => {
      await renderLoaded({ lanes: [] });

      expect(within(createForm()).getByText('No Lane is required for a range-wide record.')).toHaveAttribute(
        'class',
        'text-xs text-vscode-text-muted',
      );
      expect(within(createForm()).queryAllByRole('checkbox')).toHaveLength(0);
    });

    it('opens a case with the Final run step, the event and a trimmed allowance identity', async () => {
      operations.getByCompetition.mockResolvedValue(ok(finalRun()));
      recoveries.create.mockResolvedValue(ok(recoveryCase({ id: CREATED_ID, summary: 'Created.' })));
      await renderLoaded({ eventId: EVENT_ID, competitionTypeId: 'RFPM_FINAL' });
      const form = createForm();

      expect(within(form).getByText('Snapshot: CRO · Start')).toBeInTheDocument();
      expect(within(form).getByLabelText('Procedure profile')).toHaveValue('PISTOL_25M_RAPID_FIRE');
      expect(within(form).getByLabelText('Final phase')).toHaveValue('MATCH_SERIES');
      fireEvent.click(within(form).getByRole('checkbox', { name: 'West 4' }));
      fireEvent.change(identityInput(), { target: { value: '  ISSF-123  ' } });
      fillCreate(' Pistol jammed. ', ' Jury B ');
      fireEvent.click(within(form).getByRole('button', { name: 'Open recovery case' }));

      await waitFor(() =>
        expect(recoveries.create).toHaveBeenCalledWith({
          competitionId: COMPETITION_ID,
          eventId: EVENT_ID,
          finalRunId: RUN_ID,
          scriptStepId: 'STEP_7',
          scriptStepSnapshot: 'CRO: Start',
          allowanceSubject: { kind: 'ATHLETE', key: 'ISSF-123', description: 'Official reference: ISSF-123' },
          procedureProfile: 'PISTOL_25M_RAPID_FIRE',
          incidentType: 'MALFUNCTION',
          phase: 'MATCH_SERIES',
          affectedLaneIds: [LANE_B],
          summary: ' Pistol jammed. ',
          openedBy: ' Jury B ',
        }),
      );
    });

    it('records a Mixed Team identity as a team and leaves out what is not set', async () => {
      recoveries.create.mockResolvedValue(ok(recoveryCase({ id: CREATED_ID })));
      await renderLoaded();
      const form = createForm();
      fireEvent.change(within(form).getByLabelText('Procedure profile'), {
        target: { value: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM' },
      });
      fireEvent.change(identityInput(), { target: { value: 'Team JPN 1' } });
      fireEvent.change(within(form).getByLabelText('Final phase'), { target: { value: 'OTHER' } });
      fillCreate();
      fireEvent.click(within(form).getByRole('button', { name: 'Open recovery case' }));

      await waitFor(() => expect(recoveries.create).toHaveBeenCalledTimes(1));
      expect(recoveries.create.mock.calls[0]![0]).toEqual({
        competitionId: COMPETITION_ID,
        allowanceSubject: { kind: 'TEAM', key: 'Team JPN 1', description: 'Official reference: Team JPN 1' },
        procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
        incidentType: 'MALFUNCTION',
        phase: 'OTHER',
        affectedLaneIds: [],
        summary: 'Pistol jammed.',
        openedBy: 'Jury B',
      });
    });

    it('asks for an identity only for a malfunction and ignores a blank one', async () => {
      recoveries.create.mockResolvedValue(ok(recoveryCase({ id: CREATED_ID })));
      await renderLoaded();
      const form = createForm();
      fireEvent.change(identityInput(), { target: { value: '   ' } });
      expect(
        within(form).getByText(
          'Assigned athlete/team identity is used when available. Otherwise enter a stable reference; use the same team reference for both teammates and retain it after changing firing points.',
        ),
      ).toBeInTheDocument();
      fireEvent.change(within(form).getByLabelText('Incident'), { target: { value: 'IRREGULAR_CASE' } });
      expect(within(form).queryByLabelText(/^Athlete or team reference/)).not.toBeInTheDocument();
      fireEvent.change(within(form).getByLabelText('Incident'), { target: { value: 'MALFUNCTION' } });
      fillCreate();
      fireEvent.click(within(form).getByRole('button', { name: 'Open recovery case' }));

      await waitFor(() => expect(recoveries.create).toHaveBeenCalledTimes(1));
      expect(recoveries.create.mock.calls[0]![0]).not.toHaveProperty('allowanceSubject');
    });

    it('tracks a 25m Final malfunction for exactly one Lane', async () => {
      await renderLoaded({ competitionTypeId: 'P25_FINAL' });
      const form = createForm();
      const button = within(form).getByRole('button', { name: 'Open recovery case' });
      fillCreate();

      expect(within(form).getByLabelText('Procedure profile')).toHaveValue('PISTOL_25M_WOMEN');
      expect(
        within(form).getByText('A 25m Final malfunction claim is tracked for exactly one finalist/Lane.'),
      ).toHaveAttribute('class', 'mt-2 text-[11px] text-vscode-text-muted');
      expect(button).toBeDisabled();
      fireEvent.click(within(form).getByRole('checkbox', { name: 'FP 3 · Athlete A' }));
      fireEvent.click(within(form).getByRole('checkbox', { name: 'West 4' }));
      expect(within(form).getByRole('checkbox', { name: 'FP 3 · Athlete A' })).not.toBeChecked();
      expect(within(form).getByRole('checkbox', { name: 'West 4' })).toBeChecked();
      expect(button).toBeEnabled();

      fireEvent.change(within(form).getByLabelText('Incident'), { target: { value: 'EST_FAILURE' } });
      expect(within(form).queryByText(/tracked for exactly one finalist/)).not.toBeInTheDocument();
      fireEvent.click(within(form).getByRole('checkbox', { name: 'FP 3 · Athlete A' }));
      expect(within(form).getByRole('checkbox', { name: 'West 4' })).toBeChecked();
      expect(button).toBeEnabled();

      fireEvent.change(within(form).getByLabelText('Incident'), { target: { value: 'MALFUNCTION' } });
      expect(button).toBeDisabled();
      fireEvent.click(within(form).getByRole('checkbox', { name: 'West 4' }));
      expect(within(form).getByRole('checkbox', { name: 'FP 3 · Athlete A' })).toBeChecked();
      expect(button).toBeEnabled();
    });

    it('applies the rule defaults again when the Final context changes', async () => {
      const view = await renderLoaded({
        lanes: [lane(LANE_A, { firingPointNumber: 3 }, 1), lane(LANE_B, { firingPointNumber: 4 }, 5)],
      });
      const form = () => createForm();
      expect(within(form()).getByLabelText('Procedure profile')).toHaveValue('RIFLE_PISTOL_10M_50M');
      expect(within(form()).getByLabelText('Final phase')).toHaveValue('OTHER');

      fireEvent.click(within(form()).getByRole('checkbox', { name: 'FP 3' }));
      expect(within(form()).getByLabelText('Final phase')).toHaveValue('MATCH_SINGLE');
      fireEvent.click(within(form()).getByRole('checkbox', { name: 'FP 4' }));
      expect(within(form()).getByLabelText('Final phase')).toHaveValue('OTHER');
      fireEvent.click(within(form()).getByRole('checkbox', { name: 'FP 3' }));
      expect(within(form()).getByLabelText('Final phase')).toHaveValue('MATCH_SERIES');

      fireEvent.change(within(form()).getByLabelText('Procedure profile'), { target: { value: 'GENERAL' } });
      view.rerender(
        panel({
          phase: 'SIGHTING',
          lanes: [lane(LANE_A, { firingPointNumber: 3 }, 1), lane(LANE_B, { firingPointNumber: 4 }, 5)],
        }),
      );
      expect(within(form()).getByLabelText('Procedure profile')).toHaveValue('RIFLE_PISTOL_10M_50M');
      expect(within(form()).getByLabelText('Final phase')).toHaveValue('SIGHTING');
      expect(within(form()).getByRole('checkbox', { name: 'FP 4' })).toBeChecked();
    });

    it('takes the shoot-off purpose of the current Final step', async () => {
      operations.getByCompetition.mockResolvedValue(ok(finalRun('SHOOT_OFF')));
      await renderLoaded({ competitionTypeId: 'P25_FINAL' });

      await waitFor(() => expect(within(createForm()).getByLabelText('Final phase')).toHaveValue('SHOOT_OFF'));
    });

    it('requires observed facts and an opening official', async () => {
      await renderLoaded();
      const button = within(createForm()).getByRole('button', { name: 'Open recovery case' });
      fillCreate(' ', 'Jury B');
      expect(button).toBeDisabled();
      fillCreate('Pistol jammed.', ' ');
      expect(button).toBeDisabled();
      fillCreate();
      expect(button).toBeEnabled();
    });

    it('adds the opened case, selects it and clears the facts and Lanes only', async () => {
      const pending = deferred<CaseResponse>();
      recoveries.create.mockReturnValueOnce(pending.promise);
      await renderLoaded();
      const form = createForm();
      fireEvent.change(within(form).getByLabelText('Incident'), { target: { value: 'EST_FAILURE' } });
      fireEvent.click(within(form).getByRole('checkbox', { name: 'West 4' }));
      fillCreate();
      fireEvent.click(within(form).getByRole('button', { name: 'Open recovery case' }));

      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(within(form).getByRole('button', { name: 'Open recovery case' })).toBeDisabled();
      expect(within(detail()).getByRole('button', { name: 'Append recovery action' })).toBeDisabled();

      await act(async () =>
        pending.resolve(ok(recoveryCase({ id: CREATED_ID, incidentType: 'IRREGULAR_CASE', summary: 'Created.' }))),
      );

      expect(row(/^Irregular case/)).toHaveClass('bg-vscode-highlight');
      expect(screen.getAllByRole('button', { name: / · (Match series|Sighting)/ })).toHaveLength(3);
      expect(within(detail()).getByRole('heading', { name: 'Irregular case' })).toBeInTheDocument();
      expect(within(form).getByLabelText('Observed facts')).toHaveValue('');
      expect(within(form).getByRole('checkbox', { name: 'West 4' })).not.toBeChecked();
      expect(within(form).getByLabelText('Opening official')).toHaveValue('Jury B');
      expect(within(form).getByLabelText('Incident')).toHaveValue('EST_FAILURE');
      expect(recoveries.listByCompetition).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a failed response', () => recoveries.create.mockResolvedValue(fail('Allowance used')), 'Allowance used'],
      ['a rejected value', () => recoveries.create.mockRejectedValue('bridge closed'), 'bridge closed'],
    ])('shows %s in the panel error and keeps the draft', async (_name, failCreate, message) => {
      failCreate();
      await renderLoaded();
      fireEvent.click(within(createForm()).getByRole('checkbox', { name: 'West 4' }));
      fillCreate();
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Open recovery case' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(within(createForm()).getByLabelText('Observed facts')).toHaveValue('Pistol jammed.');
      expect(within(createForm()).getByRole('checkbox', { name: 'West 4' })).toBeChecked();
      expect(within(createForm()).getByRole('button', { name: 'Open recovery case' })).toBeEnabled();
    });
  });

  describe('case detail', () => {
    it('shows the case, the affected Lanes, the guidance and the history', async () => {
      recoveries.listByCompetition.mockResolvedValue(
        ok([
          recoveryCase({
            affectedLaneIds: [LANE_A, UNKNOWN_LANE],
            scriptStepSnapshot: 'CRO: Start',
            guidance: {
              ...recoveryCase().guidance,
              limits: {
                malfunctionAllowancePerFinal: 1,
                repairLimitSeconds: 300,
                readyLimitSeconds: 60,
                incorrectCommandAdditionalSeconds: 30,
                longDelayThresholdSeconds: 900,
                sightingTimeSeconds: 120,
              },
            },
            entries: [
              entry({ type: 'STOP_RECORDED' }),
              entry({
                id: 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2',
                type: 'JURY_RULING',
                classification: 'ALLOWABLE_MALFUNCTION',
                statement: 'Allowable.',
                officialName: 'Jury B',
              }),
              entry({
                id: 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3',
                type: 'REMEDY_AUTHORIZED',
                remedy: 'REPEAT_SINGLE_SHOT',
                statement: 'Repeat.',
              }),
            ],
          }),
        ]),
      );
      await renderLoaded();
      const view = detail();

      expect(within(view).getByText('OPEN')).toHaveAttribute('class', 'text-xs font-medium text-vscode-text-muted');
      expect(within(view).getByText('Rifle failed to fire.')).toBeInTheDocument();
      expect(within(view).getByText(`FP 3 · Athlete A, ${UNKNOWN_LANE.slice(0, 8)} · CRO: Start`)).toBeInTheDocument();
      expect(
        within(view).getByText(
          'No allowance identity captured. Confirm the original athlete or team reference below; notes and rulings remain available.',
        ),
      ).toBeInTheDocument();
      expect(within(view).getByText('ISSF 6.13.2, 6.13.3 · decision aid')).toBeInTheDocument();
      expect([...view.querySelectorAll('ul > li')].map((item) => item.textContent)).toEqual([
        'Stop the clock.',
        'Inspect the rifle.',
      ]);
      expect(
        within(view).getByText(
          'Structured limits: allowance 1/Final · repair ≤ 300s · ready ≤ 60s · additional 30s · long delay > 900s · sighting 120s',
        ),
      ).toBeInTheDocument();
      const history = [...view.querySelectorAll('section div.border-l-2')].map((item) => item.textContent);
      expect(history).toEqual([
        'Stop recorded · Clock stopped. · Jury A',
        'Jury ruling · Allowable malfunction · Allowable. · Jury B',
        'Remedy authorized · Repeat single shot · Repeat. · Jury A',
      ]);
    });

    it('shows a range-wide case, a captured identity and the absence of limits and actions', async () => {
      recoveries.listByCompetition.mockResolvedValue(
        ok([
          recoveryCase({
            allowanceSubject: { kind: 'TEAM', key: 'team-1', description: 'Official reference: team-1' },
          }),
        ]),
      );
      await renderLoaded();
      const view = detail();

      expect(within(view).getByText('Range-wide / no Lane selected')).toBeInTheDocument();
      expect(
        within(view).getByText('Allowance identity: TEAM · Official reference: team-1 (team-1)'),
      ).toBeInTheDocument();
      expect(within(view).getByText('No fixed numeric limit in this guidance.')).toBeInTheDocument();
      expect(within(view).getByText('No actions recorded.')).toBeInTheDocument();
      expect(within(view).queryByLabelText('Original athlete or team reference')).not.toBeInTheDocument();
    });

    it.each([
      ['OPEN', ['Stop recorded', 'Jury ruling', 'Note', 'Void'], 'STOP_RECORDED'],
      ['STOPPED', ['Jury ruling', 'Note', 'Void'], 'JURY_RULING'],
      ['RULING_RECORDED', ['Remedy authorized', 'Note', 'Void'], 'REMEDY_AUTHORIZED'],
      ['RECOVERY_AUTHORIZED', ['Remedy authorized', 'Resumed', 'Completed', 'Note', 'Void'], 'REMEDY_AUTHORIZED'],
      ['RESUMED', ['Completed', 'Note', 'Void'], 'COMPLETED'],
      ['COMPLETED', ['Note', 'Void'], 'NOTE'],
    ] as const)('offers the actions a %s case allows', async (status, expected, initial) => {
      recoveries.listByCompetition.mockResolvedValue(ok([recoveryCase({ status })]));
      await renderLoaded();

      expect(optionTexts(within(detail()).getByLabelText('Action'))).toEqual(expected);
      expect(within(detail()).getByLabelText('Action')).toHaveValue(initial);
    });

    it('hides the actions of a void case', async () => {
      recoveries.listByCompetition.mockResolvedValue(ok([recoveryCase({ status: 'VOID' })]));
      await renderLoaded();

      expect(within(detail()).getByText('No actions recorded.')).toBeInTheDocument();
      expect(within(detail()).queryByLabelText('Action')).not.toBeInTheDocument();
      expect(within(detail()).queryByRole('button', { name: 'Append recovery action' })).not.toBeInTheDocument();
    });

    it('records a Jury ruling with its classification, rule reference and remaining time', async () => {
      recoveries.appendEntry.mockResolvedValue(ok(recoveryCase({ status: 'RULING_RECORDED' })));
      recoveries.listByCompetition.mockResolvedValue(ok([recoveryCase({ incidentType: 'EST_FAILURE' })]));
      await renderLoaded();
      fillAction('JURY_RULING');
      const view = detail();

      expect(within(view).getByLabelText('Rule reference')).toHaveValue('6.13.2');
      expect(optionTexts(within(view).getByLabelText('Classification'))).toEqual([
        'Allowable malfunction',
        'Non allowable malfunction',
      ]);
      expect(within(view).queryByLabelText('Authorized remedy')).not.toBeInTheDocument();
      expect(within(view).queryByLabelText('Granted sec.')).not.toBeInTheDocument();
      fireEvent.change(within(view).getByLabelText('Classification'), {
        target: { value: 'NON_ALLOWABLE_MALFUNCTION' },
      });
      fireEvent.change(within(view).getByLabelText('Remaining sec.'), { target: { value: '42' } });
      fireEvent.click(within(view).getByRole('button', { name: 'Append recovery action' }));

      await waitFor(() =>
        expect(recoveries.appendEntry).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          type: 'JURY_RULING',
          statement: 'Jury decided.',
          officialName: 'Jury C',
          ruleReference: '6.13.2',
          classification: 'NON_ALLOWABLE_MALFUNCTION',
          remainingTimeSeconds: 42,
        }),
      );
    });

    it('authorizes a remedy with its time and shots and leaves out a blank rule reference', async () => {
      recoveries.listByCompetition.mockResolvedValue(
        ok([recoveryCase({ status: 'RULING_RECORDED', incidentType: 'EST_FAILURE' })]),
      );
      recoveries.appendEntry.mockResolvedValue(ok(recoveryCase({ status: 'RECOVERY_AUTHORIZED' })));
      await renderLoaded();
      fillAction('REMEDY_AUTHORIZED');
      const view = detail();

      expect(optionTexts(within(view).getByLabelText('Authorized remedy'))).toEqual(['Repeat single shot', 'Continue']);
      fireEvent.change(within(view).getByLabelText('Authorized remedy'), { target: { value: 'CONTINUE' } });
      fireEvent.change(within(view).getByLabelText('Rule reference'), { target: { value: '  ' } });
      fireEvent.change(within(view).getByLabelText('Granted sec.'), { target: { value: '60' } });
      fireEvent.change(within(view).getByLabelText('Authorized shots'), { target: { value: '0' } });
      fireEvent.click(within(view).getByRole('button', { name: 'Append recovery action' }));

      await waitFor(() =>
        expect(recoveries.appendEntry).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          type: 'REMEDY_AUTHORIZED',
          statement: 'Jury decided.',
          officialName: 'Jury C',
          remedy: 'CONTINUE',
          grantedTimeSeconds: 60,
          shotCount: 0,
        }),
      );
    });

    it('marks a void action and requires an official and a statement', async () => {
      recoveries.listByCompetition.mockResolvedValue(ok([recoveryCase({ incidentType: 'EST_FAILURE' })]));
      await renderLoaded();
      const view = detail();
      const button = within(view).getByRole('button', { name: 'Append recovery action' });

      expect(button.className).toContain('bg-vscode-primary');
      expect(button).toBeDisabled();
      fillAction('VOID', 'Opened by mistake.', ' ');
      expect(button.className).toContain('text-vscode-error');
      expect(button).toBeDisabled();
      fillAction('VOID', ' ', 'Jury C');
      expect(button).toBeDisabled();
      fillAction('VOID', 'Opened by mistake.', 'Jury C');
      expect(button).toBeEnabled();
    });

    it('replaces the changed case, clears the times and statement and resets a disallowed action', async () => {
      recoveries.listByCompetition.mockResolvedValue(
        ok([recoveryCase({ status: 'RULING_RECORDED', incidentType: 'EST_FAILURE' }), secondCase()]),
      );
      const pending = deferred<CaseResponse>();
      recoveries.appendEntry.mockReturnValueOnce(pending.promise);
      await renderLoaded();
      fireEvent.click(row(/^Est failure · Match series/));
      fillAction('REMEDY_AUTHORIZED');
      fireEvent.change(within(detail()).getByLabelText('Rule reference'), { target: { value: '6.13.9' } });
      fireEvent.change(within(detail()).getByLabelText('Remaining sec.'), { target: { value: '10' } });
      fireEvent.change(within(detail()).getByLabelText('Granted sec.'), { target: { value: '60' } });
      fireEvent.change(within(detail()).getByLabelText('Authorized shots'), { target: { value: '1' } });
      fireEvent.click(within(detail()).getByRole('button', { name: 'Append recovery action' }));

      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(within(detail()).getByRole('button', { name: 'Append recovery action' })).toBeDisabled();
      expect(within(createForm()).getByRole('button', { name: 'Open recovery case' })).toBeDisabled();

      await act(async () =>
        pending.resolve(ok(recoveryCase({ status: 'RESUMED', incidentType: 'EST_FAILURE', summary: 'Resumed.' }))),
      );

      expect(row(/^Est failure · Match series/)).toHaveTextContent('Est failure · Match seriesRESUMED · Resumed.');
      expect(row(/^Est failure · Match series/)).toHaveClass('bg-vscode-highlight');
      const view = detail();
      expect(within(view).getByLabelText('Action')).toHaveValue('COMPLETED');
      expect(within(view).getByLabelText('Statement')).toHaveValue('');
      expect(within(view).getByLabelText('Remaining sec.')).toHaveValue(null);
      expect(within(view).getByLabelText('Official')).toHaveValue('Jury C');
      expect(within(view).getByLabelText('Rule reference')).toHaveValue('6.13.9');
      fireEvent.change(within(view).getByLabelText('Action'), { target: { value: 'REMEDY_AUTHORIZED' } });
      expect(optionTexts(within(view).getByLabelText('Action'))).toEqual(['Completed', 'Note', 'Void']);
      expect(recoveries.listByCompetition).toHaveBeenCalledTimes(1);
    });

    it('sends the granted time only with a remedy authorization', async () => {
      recoveries.listByCompetition.mockResolvedValue(
        ok([recoveryCase({ status: 'RECOVERY_AUTHORIZED', incidentType: 'EST_FAILURE' })]),
      );
      recoveries.appendEntry.mockResolvedValue(
        ok(recoveryCase({ status: 'RECOVERY_AUTHORIZED', incidentType: 'EST_FAILURE' })),
      );
      await renderLoaded();
      fillAction('REMEDY_AUTHORIZED');
      fireEvent.change(within(detail()).getByLabelText('Granted sec.'), { target: { value: '60' } });
      fireEvent.change(within(detail()).getByLabelText('Action'), { target: { value: 'RESUMED' } });
      expect(within(detail()).queryByLabelText('Granted sec.')).not.toBeInTheDocument();
      fireEvent.click(within(detail()).getByRole('button', { name: 'Append recovery action' }));

      await waitFor(() =>
        expect(recoveries.appendEntry).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          type: 'RESUMED',
          statement: 'Jury decided.',
          officialName: 'Jury C',
          ruleReference: '6.13.2',
        }),
      );
    });

    it.each([
      ['a failed response', () => recoveries.appendEntry.mockResolvedValue(fail('Case is closed')), 'Case is closed'],
      ['a rejected value', () => recoveries.appendEntry.mockRejectedValue('bridge closed'), 'bridge closed'],
    ])('shows %s of an action in the panel error and keeps the draft', async (_name, failAppend, message) => {
      failAppend();
      await renderLoaded();
      fillAction('NOTE');
      fireEvent.click(within(detail()).getByRole('button', { name: 'Append recovery action' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(within(detail()).getByLabelText('Statement')).toHaveValue('Jury decided.');
      expect(within(detail()).getByRole('button', { name: 'Append recovery action' })).toBeEnabled();
    });

    it('confirms the allowance identity of a malfunction and keeps the draft', async () => {
      recoveries.listByCompetition.mockResolvedValue(
        ok([recoveryCase({ procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM' })]),
      );
      recoveries.bindAllowanceSubject.mockResolvedValue(
        ok(
          recoveryCase({
            procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
            allowanceSubject: { kind: 'TEAM', key: 'JPN 1', description: 'Official reference: JPN 1' },
          }),
        ),
      );
      await renderLoaded();
      const view = detail();
      const confirm = within(view).getByRole('button', { name: 'Confirm allowance identity' });
      expect(
        within(view).getByText(
          'Use the same identity as related cases. The official and statement above attest this permanent association.',
        ),
      ).toBeInTheDocument();
      fillAction('NOTE', 'Same team as case 1.', 'Jury C');
      expect(confirm).toBeDisabled();
      fireEvent.change(within(view).getByLabelText('Original athlete or team reference'), {
        target: { value: 'JPN 1' },
      });
      fireEvent.click(confirm);

      await waitFor(() =>
        expect(recoveries.bindAllowanceSubject).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          subject: { kind: 'TEAM', key: 'JPN 1', description: 'Official reference: JPN 1' },
          officialName: 'Jury C',
          statement: 'Same team as case 1.',
        }),
      );
      expect(
        await within(detail()).findByText('Allowance identity: TEAM · Official reference: JPN 1 (JPN 1)'),
      ).toBeInTheDocument();
      expect(within(detail()).queryByLabelText('Original athlete or team reference')).not.toBeInTheDocument();
      expect(within(detail()).getByLabelText('Statement')).toHaveValue('Same team as case 1.');
      expect(recoveries.appendEntry).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a failed response',
        () => recoveries.bindAllowanceSubject.mockResolvedValue(fail('Identity already bound')),
        'Identity already bound',
      ],
      ['a rejected value', () => recoveries.bindAllowanceSubject.mockRejectedValue('bridge closed'), 'bridge closed'],
    ])('shows %s of an identity confirmation in the panel error', async (_name, failBind, message) => {
      failBind();
      await renderLoaded();
      fireEvent.click(row(/^Malfunction · Match series/));
      fillAction('NOTE', 'Same athlete.', 'Jury C');
      fireEvent.change(within(detail()).getByLabelText('Original athlete or team reference'), {
        target: { value: 'ISSF-1' },
      });
      fireEvent.click(within(detail()).getByRole('button', { name: 'Confirm allowance identity' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(recoveries.bindAllowanceSubject).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: { kind: 'ATHLETE', key: 'ISSF-1', description: 'Official reference: ISSF-1' },
        }),
      );
      expect(within(detail()).getByLabelText('Original athlete or team reference')).toHaveValue('ISSF-1');
    });

    it('discards the action draft when another case is selected', async () => {
      await renderLoaded();
      fillAction('NOTE', 'Draft for the second case');
      fireEvent.click(row(/^Malfunction · Match series/));
      expect(within(detail()).getByLabelText('Statement')).toHaveValue('');
      fireEvent.click(row(/^Est failure · Sighting/));
      expect(within(detail()).getByLabelText('Statement')).toHaveValue('');
      expect(within(detail()).getByLabelText('Official')).toHaveValue('');
    });

    it('disables the commands but not refresh when the panel is disabled', async () => {
      await renderLoaded({ disabled: true });
      fillCreate();
      fillAction('NOTE');

      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
      expect(within(createForm()).getByRole('button', { name: 'Open recovery case' })).toBeDisabled();
      expect(within(detail()).getByRole('button', { name: 'Append recovery action' })).toBeDisabled();
    });
  });
});
