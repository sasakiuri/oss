import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QualificationMalfunctionPanel } from '@/renderer/presentation/features/qualification-malfunctions';
import { qualificationMalfunctionsService } from '@/renderer/services';
import type {
  DirectorLaneSnapshotDto,
  QualificationMalfunctionCaseDto,
  QualificationMalfunctionEntryDto,
} from '@/shared/ipc/contracts';

import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const service = vi.mocked(qualificationMalfunctionsService);

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPETITION_ID = '12121212-1212-4212-8212-121212121212';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ID = '33333333-3333-4333-8333-333333333333';
const LANE_ID = '44444444-4444-4444-8444-444444444444';
const SESSION_ID = '55555555-5555-4555-8555-555555555555';
const SIGNAL_ID = '77777777-7777-4777-8777-777777777777';
const FIRST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CREATED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type Policy = QualificationMalfunctionCaseDto['policySnapshot'];
type ListResponse = ReturnType<typeof ok<QualificationMalfunctionCaseDto[]>>;
type CaseResponse = ReturnType<typeof ok<QualificationMalfunctionCaseDto>>;

function policy(overrides: Partial<Policy> = {}): Policy {
  return {
    determinationAuthority: 'RANGE_OFFICER',
    causes: [
      { code: 'AMMUNITION', classification: 'ALLOWABLE', label: 'Ammunition failure', ruleReference: '8.9.1' },
      { code: 'SPRING', classification: 'ALLOWABLE', label: 'Broken spring', ruleReference: '8.9.2' },
      { code: 'ATHLETE', classification: 'NON_ALLOWABLE', label: 'Athlete error', ruleReference: '8.9.3' },
    ],
    repair: {
      maximumSeconds: 900,
      juryMayExtend: true,
      completionScheduling: 'WITHIN_ORIGINAL_COMPETITION_TIME',
      replacement: { sameTypeAndCalibreRequired: true, targetedTestingRequired: true },
      additionalSighting: { policy: 'JURY_MAY_ALLOW', shots: null },
      ruleReferences: ['8.9.4'],
    },
    nonAllowableTreatment: {
      unfiredShots: 'MISS',
      refirePermitted: false,
      completionPermitted: false,
      ruleReference: '8.9.5',
    },
    stages: [
      {
        stageId: 'STAGE_1',
        allowableTreatment: {
          type: 'COMPLETE_REMAINING_SHOTS',
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 10 },
          scoreCombination: 'NORMAL_SERIES',
          incidentForm: 'IR',
        },
        ruleReference: '8.9.4.1',
      },
      {
        stageId: 'STAGE_2',
        allowableTreatment: {
          type: 'REPEAT_FULL_SERIES',
          shots: 5,
          scoreCombination: 'LOWEST_PER_TARGET',
          scoreCount: 5,
          secondMalfunction: 'ZERO_FILL_ROW_WITH_MOST_RECORDED_SHOTS',
          incidentForm: 'RFPM',
        },
        ruleReference: '8.9.4.5',
      },
      { stageId: 'STAGE_3', allowableTreatment: { type: 'CONTINUE_WITHIN_ORIGINAL_TIME' }, ruleReference: '8.9.4.2' },
    ],
    documentation: {
      incidentRecords: ['RANGE_INCIDENT_REPORT', 'RFPM'],
      selection: 'ONE_OF',
      rangeRegisterRequired: true,
      ruleReferences: ['6.14.6'],
    },
    ruleReferences: ['8.9.1', '8.9.4'],
    ...overrides,
  };
}

function entry(overrides: Partial<QualificationMalfunctionEntryDto> = {}): QualificationMalfunctionEntryDto {
  return {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    caseId: FIRST_ID,
    type: 'NOTE',
    statement: 'Pistol inspected at the firing point.',
    officialName: 'RO A',
    officialRole: 'RANGE_OFFICER',
    ruleReference: null,
    classification: null,
    causeCode: null,
    remedy: null,
    shotsToFire: null,
    repairSeconds: null,
    artifactId: null,
    occurredAt: '2026-09-04T01:01:00.000Z',
    recordedAt: '2026-09-04T01:01:00.000Z',
    ...overrides,
  };
}

const classified = (classification: 'ALLOWABLE' | 'NON_ALLOWABLE', id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1') =>
  entry({
    id,
    type: 'CLASSIFIED',
    classification,
    causeCode: classification === 'ALLOWABLE' ? 'AMMUNITION' : 'ATHLETE',
  });

function malfunctionCase(overrides: Partial<QualificationMalfunctionCaseDto> = {}): QualificationMalfunctionCaseDto {
  return {
    id: FIRST_ID,
    competitionId: COMPETITION_ID,
    eventId: EVENT_ID,
    competitionTypeId: 'RFPM',
    rulePackIdentity: null,
    policySnapshot: policy(),
    participantId: PARTICIPANT_ID,
    participantNameSnapshot: 'Athlete A',
    startNumberSnapshot: '101',
    laneId: LANE_ID,
    laneChannelSnapshot: 7,
    relayNumberSnapshot: 2,
    reportSource: 'DIRECTOR_MANUAL',
    sourceSignalId: null,
    claimMode: 'CLAIM',
    phase: 'MATCH',
    stageId: 'STAGE_1',
    stageIndex: 1,
    seriesIndex: 3,
    seriesShotLimit: 10,
    recordedShots: 2,
    timedTargetProgramId: null,
    exposureIndex: null,
    laneSessionId: SESSION_ID,
    laneSnapshotCapturedAt: null,
    exceptionalMatchPart: null,
    existingClaimsInScope: 0,
    existingClaimsInPart: null,
    claimAssessment: { allowed: true, maximumInScope: 1, maximumInExceptionalPart: null, reason: 'AVAILABLE' },
    summary: 'Projectile lodged.',
    openedBy: 'RO A',
    occurredAt: '2026-09-04T01:00:00.000Z',
    createdAt: '2026-09-04T01:00:00.000Z',
    status: 'OPEN',
    entries: [],
    ...overrides,
  };
}

const secondCase = (overrides: Partial<QualificationMalfunctionCaseDto> = {}) =>
  malfunctionCase({
    id: SECOND_ID,
    participantNameSnapshot: 'Athlete B',
    startNumberSnapshot: null,
    laneChannelSnapshot: 8,
    claimMode: 'DOCUMENTATION_ONLY',
    status: 'INSPECTED',
    summary: 'Magazine jammed.',
    ...overrides,
  });

function lane(overrides: Partial<DirectorLaneSnapshotDto> = {}): DirectorLaneSnapshotDto {
  return {
    laneId: LANE_ID,
    laneAlias: 'Lane 7',
    firingPointNumber: 7,
    hardware: null,
    safetyState: null,
    rangeOfficerRequest: null,
    qualificationMalfunctionSignal: null,
    timedTargetState: null,
    qualificationRecoveryState: null,
    competitionState: {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      sessionId: SESSION_ID,
      phase: 'MATCH',
      currentStage: { index: 1, name: 'Stage 1', scored: true, totalSeries: 6 },
      currentSeries: { index: 3, shotsRecorded: 2, maxShots: 5 },
      publishedAt: '2026-09-04T01:00:00.000Z',
    },
    assignment: {
      competitionId: COMPETITION_ID,
      laneId: LANE_ID,
      athlete: { id: PARTICIPANT_ID, startNumber: 101, name: 'Athlete A' },
      assignedAt: '2026-09-04T00:50:00.000Z',
      publishedAt: '2026-09-04T00:50:00.000Z',
    },
    score: null,
    lastRawShot: null,
    lastCompetitionShot: null,
    lastQualificationRecoveryShot: null,
    lastSeenAt: '2026-09-04T01:00:00.000Z',
    ...overrides,
  };
}

function signal(
  overrides: Partial<NonNullable<DirectorLaneSnapshotDto['qualificationMalfunctionSignal']>> = {},
): DirectorLaneSnapshotDto['qualificationMalfunctionSignal'] {
  return {
    schemaVersion: 1,
    laneId: LANE_ID,
    status: 'ACTIVE',
    signalId: SIGNAL_ID,
    context: {
      competitionId: COMPETITION_ID,
      sessionId: SESSION_ID,
      participantId: PARTICIPANT_ID,
      participantName: 'Athlete A',
      startNumber: '101',
      phase: 'MATCH',
      stageIndex: 0,
      seriesIndex: 1,
      seriesShotLimit: 5,
      recordedShots: 4,
      timedTargetProgramId: 'RFP_MATCH_8',
      exposureIndex: 3,
    },
    message: null,
    signalledAt: '2026-09-04T01:00:00.000Z',
    clearedAt: null,
    clearedBy: null,
    publishedAt: '2026-09-04T01:00:00.000Z',
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface PanelProps {
  lanes?: readonly DirectorLaneSnapshotDto[];
  supportsExceptionalMatchParts?: boolean;
  disabled?: boolean;
}

function renderPanel({ lanes = [lane()], supportsExceptionalMatchParts = false, disabled }: PanelProps = {}) {
  return render(
    <QualificationMalfunctionPanel
      competitionId={COMPETITION_ID}
      eventId={EVENT_ID}
      relayNumber={2}
      lanes={lanes}
      supportsExceptionalMatchParts={supportsExceptionalMatchParts}
      {...(disabled === undefined ? {} : { disabled })}
    />,
  );
}

async function renderLoaded(props: PanelProps = {}) {
  renderPanel(props);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
}

const errorBanner = () => document.querySelector('p.border-l-2.border-vscode-error');
const createForm = () => screen.getByText('Open a malfunction record').parentElement as HTMLElement;
const detail = () => screen.getByText('Append-only history').closest('div.space-y-3') as HTMLElement;
const appendForm = () => screen.getByText('Append an official entry').parentElement as HTMLElement;
const row = (name: RegExp) => screen.getByRole('button', { name });
const optionTexts = (select: HTMLElement) =>
  [...(select as HTMLSelectElement).options].map((option) => option.textContent);

function fillCreate(summary = 'Projectile lodged.', official = 'RO A') {
  fireEvent.change(within(createForm()).getByLabelText('Observed facts'), { target: { value: summary } });
  fireEvent.change(within(createForm()).getByLabelText('Opening official'), { target: { value: official } });
}

function fillAppend(type: string, statement = 'Recorded at the line.', official = 'Jury B') {
  fireEvent.change(within(appendForm()).getByLabelText('Entry type'), { target: { value: type } });
  fireEvent.change(within(appendForm()).getByLabelText('Statement'), { target: { value: statement } });
  fireEvent.change(within(appendForm()).getByLabelText('Official name'), { target: { value: official } });
}

describe('QualificationMalfunctionPanel workspace', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.listByCompetition.mockResolvedValue(ok([malfunctionCase(), secondCase()]));
    service.listScoreSheets.mockResolvedValue(ok([]));
  });

  describe('case list', () => {
    it('lists the competition cases and selects the newest one', async () => {
      await renderLoaded();

      expect(service.listByCompetition).toHaveBeenCalledWith({ competitionId: COMPETITION_ID });
      expect(row(/^FP 7 · Athlete A/)).toHaveTextContent('FP 7 · Athlete AOpen · Claim · Projectile lodged.');
      expect(row(/^FP 8 · Athlete B/)).toHaveTextContent(
        'FP 8 · Athlete BInspected · Documentation only · Magazine jammed.',
      );
      expect(row(/^FP 8 · Athlete B/)).toHaveAttribute(
        'class',
        'block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 bg-vscode-highlight',
      );
      expect(row(/^FP 7 · Athlete A/)).toHaveAttribute(
        'class',
        'block w-full border-b border-vscode-border px-3 py-2.5 text-left last:border-b-0 hover:bg-vscode-bg-hover',
      );
      expect(within(detail()).getByText('Magazine jammed.')).toBeInTheDocument();
      expect(screen.queryByText('No malfunction cases.')).not.toBeInTheDocument();
    });

    it('keeps the selected case on refresh and falls back to the newest case when it disappears', async () => {
      await renderLoaded();
      fireEvent.click(row(/^FP 7 · Athlete A/));
      expect(within(detail()).getByText('Projectile lodged.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(service.listByCompetition).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
      expect(row(/^FP 7 · Athlete A/)).toHaveClass('bg-vscode-highlight');

      service.listByCompetition.mockResolvedValue(
        ok([secondCase(), malfunctionCase({ id: CREATED_ID, participantNameSnapshot: 'Athlete C' })]),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(row(/^FP 7 · Athlete C/)).toHaveClass('bg-vscode-highlight'));
      expect(row(/^FP 8 · Athlete B/)).toHaveClass('hover:bg-vscode-bg-hover');
    });

    it('shows the empty text only after loading and disables refresh while loading', async () => {
      const pending = deferred<ListResponse>();
      service.listByCompetition.mockReturnValueOnce(pending.promise);
      renderPanel();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(within(createForm()).getByRole('button', { name: 'Open malfunction case' })).toBeDisabled();
      expect(screen.queryByText('No malfunction cases.')).not.toBeInTheDocument();

      await act(async () => pending.resolve(ok([])));

      expect(screen.getByText('No malfunction cases.')).toHaveAttribute('class', 'p-3 text-xs text-vscode-text-muted');
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
      expect(screen.queryByText('Append-only history')).not.toBeInTheDocument();
    });

    it('shows a failed load in the panel error and clears it on the next load', async () => {
      service.listByCompetition.mockResolvedValueOnce(fail('Competition ledger unavailable'));
      renderPanel();

      await screen.findByText('Competition ledger unavailable');
      expect(errorBanner()).toHaveTextContent(/^Competition ledger unavailable$/);
      expect(errorBanner()).toHaveAttribute('class', 'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error');
      expect(errorBanner()).not.toHaveAttribute('role');

      service.listByCompetition.mockRejectedValueOnce('bridge closed');
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(errorBanner()).toHaveTextContent(/^bridge closed$/));

      service.listByCompetition.mockRejectedValueOnce(new Error('Database locked'));
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(errorBanner()).toHaveTextContent(/^Database locked$/));

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      await waitFor(() => expect(errorBanner()).toBeNull());
      expect(row(/^FP 8 · Athlete B/)).toBeInTheDocument();
    });
  });

  describe('opening a case', () => {
    it('lists only Lanes assigned to the competition with a registered participant', async () => {
      const otherLane = '88888888-8888-4888-8888-888888888888';
      const unresolvedLane = '99999999-9999-4999-8999-999999999999';
      await renderLoaded({
        lanes: [
          lane({
            laneId: otherLane,
            assignment: { ...lane().assignment!, competitionId: OTHER_COMPETITION_ID, laneId: otherLane },
          }),
          lane({
            laneId: 'not-a-uuid-lane',
            assignment: {
              ...lane().assignment!,
              laneId: 'not-a-uuid-lane',
              athlete: { id: 'athlete-local-1', startNumber: 103, name: 'Athlete Local' },
            },
          }),
          lane(),
          lane({
            laneId: unresolvedLane,
            firingPointNumber: null,
            competitionState: null,
            assignment: {
              ...lane().assignment!,
              laneId: unresolvedLane,
              athlete: { id: '66666666-6666-4666-8666-666666666666', startNumber: 104, name: 'Athlete D' },
            },
          }),
        ],
      });

      const select = within(createForm()).getByLabelText('Athlete / firing point');
      expect(optionTexts(select)).toEqual([
        'Select an assigned Lane',
        'FP 7 · 101 · Athlete A',
        'FP unresolved · 104 · Athlete D',
      ]);
      expect(select).toHaveValue(LANE_ID);
      expect(within(createForm()).getByLabelText('Firing point')).toHaveValue(7);

      fireEvent.change(within(createForm()).getByLabelText('Stage index'), { target: { value: '4' } });
      fireEvent.change(select, { target: { value: unresolvedLane } });
      expect(within(createForm()).getByLabelText('Firing point')).toHaveValue(7);
      expect(within(createForm()).getByLabelText('Stage index')).toHaveValue(4);
      expect(within(createForm()).getByLabelText('Series index')).toHaveValue(3);
      expect(within(createForm()).getByLabelText('Shots already recorded')).toHaveValue(2);

      // Clearing the choice returns to the first eligible Lane and its context.
      fireEvent.change(select, { target: { value: '' } });
      expect(select).toHaveValue(LANE_ID);
      expect(within(createForm()).getByLabelText('Stage index')).toHaveValue(1);
      expect(screen.queryByText(/Link a championship event/)).not.toBeInTheDocument();
    });

    it('asks for an assigned Lane when none is eligible', async () => {
      await renderLoaded({ lanes: [lane({ assignment: null })] });

      expect(optionTexts(within(createForm()).getByLabelText('Athlete / firing point'))).toEqual([
        'Select an assigned Lane',
      ]);
      expect(
        screen.getByText('Link a championship event and assign a registered participant to a Lane first.'),
      ).toHaveAttribute('class', 'mt-2 text-xs text-vscode-warning');
      expect(within(createForm()).getByLabelText('Firing point')).toHaveValue(1);
      expect(within(createForm()).getByLabelText('Stage index')).toHaveValue(0);
      fillCreate();
      expect(within(createForm()).getByRole('button', { name: 'Open malfunction case' })).toBeDisabled();
    });

    it.each([
      ['Firing point', '0', false],
      ['Firing point', '2.5', false],
      ['Stage index', '-1', false],
      ['Series index', '1.5', false],
      ['Shots already recorded', '', true],
    ])('checks the %s value %j (enabled: %s)', async (label, value, enabled) => {
      await renderLoaded();
      fillCreate();
      const button = within(createForm()).getByRole('button', { name: 'Open malfunction case' });
      expect(button).toBeEnabled();

      fireEvent.change(within(createForm()).getByLabelText(label), { target: { value } });

      expect(button).toHaveProperty('disabled', !enabled);
    });

    it('requires observed facts and an opening official', async () => {
      await renderLoaded();
      const button = within(createForm()).getByRole('button', { name: 'Open malfunction case' });
      fillCreate('   ', 'RO A');
      expect(button).toBeDisabled();
      fillCreate('Projectile lodged.', ' ');
      expect(button).toBeDisabled();
      fillCreate('Projectile lodged.', 'RO A');
      expect(button).toBeEnabled();
    });

    it('sends the timed exposure, the record mode and the exceptional match part', async () => {
      const created = malfunctionCase({ id: CREATED_ID, participantNameSnapshot: 'Athlete C', summary: 'Created.' });
      service.create.mockResolvedValue(ok(created));
      await renderLoaded({
        supportsExceptionalMatchParts: true,
        lanes: [
          lane({
            timedTargetState: {
              competitionId: COMPETITION_ID,
              stageIndex: 1,
              seriesIndex: 3,
              exposureIndex: 2,
            } as DirectorLaneSnapshotDto['timedTargetState'],
          }),
        ],
      });
      const form = createForm();
      expect(optionTexts(within(form).getByLabelText('Exceptional match part'))).toEqual([
        'Not split',
        'Part 1',
        'Part 2',
      ]);
      fireEvent.change(within(form).getByLabelText('Record mode'), { target: { value: 'DOCUMENTATION_ONLY' } });
      fireEvent.change(within(form).getByLabelText('Exceptional match part'), { target: { value: '2' } });
      fillCreate(' Slide locked open. ', ' RO B ');
      fireEvent.click(within(form).getByRole('button', { name: 'Open malfunction case' }));

      await waitFor(() =>
        expect(service.create).toHaveBeenCalledWith({
          competitionId: COMPETITION_ID,
          eventId: EVENT_ID,
          participantId: PARTICIPANT_ID,
          laneId: LANE_ID,
          laneChannel: 7,
          relayNumber: 2,
          reportSource: 'DIRECTOR_MANUAL',
          claimMode: 'DOCUMENTATION_ONLY',
          stageIndex: 1,
          seriesIndex: 3,
          recordedShots: 2,
          exposureIndex: 2,
          laneSessionId: SESSION_ID,
          exceptionalMatchPart: 2,
          summary: ' Slide locked open. ',
          openedBy: ' RO B ',
        }),
      );
    });

    it('omits the exposure and the Lane session that belong to another firing context', async () => {
      service.create.mockResolvedValue(ok(malfunctionCase({ id: CREATED_ID })));
      await renderLoaded({
        lanes: [
          lane({
            timedTargetState: {
              competitionId: COMPETITION_ID,
              stageIndex: 1,
              seriesIndex: 2,
              exposureIndex: 2,
            } as DirectorLaneSnapshotDto['timedTargetState'],
            competitionState: { ...lane().competitionState!, competitionId: OTHER_COMPETITION_ID },
          }),
        ],
      });
      expect(within(createForm()).queryByLabelText('Exceptional match part')).not.toBeInTheDocument();
      fillCreate();
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Open malfunction case' }));

      await waitFor(() => expect(service.create).toHaveBeenCalledTimes(1));
      expect(service.create.mock.calls[0]![0]).toEqual({
        competitionId: COMPETITION_ID,
        eventId: EVENT_ID,
        participantId: PARTICIPANT_ID,
        laneId: LANE_ID,
        laneChannel: 7,
        relayNumber: 2,
        reportSource: 'DIRECTOR_MANUAL',
        claimMode: 'CLAIM',
        stageIndex: 1,
        seriesIndex: 3,
        recordedShots: 2,
        summary: 'Projectile lodged.',
        openedBy: 'RO A',
      });
    });

    it('adds the opened case, selects it and clears only the observed facts', async () => {
      const created = malfunctionCase({ id: CREATED_ID, participantNameSnapshot: 'Athlete C', summary: 'Created.' });
      const pending = deferred<CaseResponse>();
      service.create.mockReturnValueOnce(pending.promise);
      await renderLoaded();
      fireEvent.change(within(createForm()).getByLabelText('Record mode'), { target: { value: 'DOCUMENTATION_ONLY' } });
      fillCreate();
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Open malfunction case' }));

      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(within(createForm()).getByRole('button', { name: 'Open malfunction case' })).toBeDisabled();
      expect(within(appendForm()).getByRole('button', { name: 'Append entry' })).toBeDisabled();

      await act(async () => pending.resolve(ok(created)));

      expect(row(/^FP 7 · Athlete C/)).toHaveClass('bg-vscode-highlight');
      expect(screen.getAllByRole('button', { name: /^FP \d/ })).toHaveLength(3);
      expect(within(detail()).getByText('Created.')).toBeInTheDocument();
      expect(within(createForm()).getByLabelText('Observed facts')).toHaveValue('');
      expect(within(createForm()).getByLabelText('Opening official')).toHaveValue('RO A');
      expect(within(createForm()).getByLabelText('Record mode')).toHaveValue('DOCUMENTATION_ONLY');
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
      expect(service.listByCompetition).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a failed response', () => service.create.mockResolvedValue(fail('Claim limit reached')), 'Claim limit reached'],
      ['a rejected value', () => service.create.mockRejectedValue('bridge closed'), 'bridge closed'],
    ])('shows %s in the panel error and keeps the draft', async (_name, failCreate, message) => {
      failCreate();
      await renderLoaded();
      fillCreate();
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Open malfunction case' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(within(createForm()).getByLabelText('Observed facts')).toHaveValue('Projectile lodged.');
      expect(screen.getAllByRole('button', { name: /^FP \d/ })).toHaveLength(2);
      expect(within(createForm()).getByRole('button', { name: 'Open malfunction case' })).toBeEnabled();

      service.create.mockResolvedValue(ok(malfunctionCase({ id: CREATED_ID })));
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Open malfunction case' }));
      await waitFor(() => expect(errorBanner()).toBeNull());
    });

    it('fills the form from a Lane declaration and returns to the Lane context for manual entry', async () => {
      await renderLoaded({ lanes: [lane({ qualificationMalfunctionSignal: signal() })] });
      const form = createForm();
      expect(within(form).getByText('Lane declarations')).toBeInTheDocument();
      expect(within(form).getByText('FP 7 · Athlete A · stage 1, series 2 · Active')).toBeInTheDocument();

      fireEvent.click(within(form).getByRole('button', { name: 'Use Lane declaration' }));

      expect(within(form).getByLabelText('Observed facts')).toHaveValue(
        'Possible firearm malfunction declared by Lane.',
      );
      expect(within(form).getByLabelText('Stage index')).toHaveValue(0);
      expect(within(form).getByLabelText('Series index')).toHaveValue(1);
      expect(within(form).getByLabelText('Shots already recorded')).toHaveValue(4);
      expect(
        within(form).getByText(
          `Lane declaration selected · signalled ${new Date('2026-09-04T01:00:00.000Z').toLocaleString()}`,
        ),
      ).toBeInTheDocument();
      expect(
        within(form).getByText(
          'Details reported by Lane cannot be edited. Select the claim mode; record the official ruling after inspection.',
        ),
      ).toBeInTheDocument();
      expect(within(form).getByLabelText('Record mode')).toBeEnabled();

      fireEvent.click(within(form).getByRole('button', { name: 'Use manual entry' }));

      expect(within(form).queryByText(/Lane declaration selected/)).not.toBeInTheDocument();
      expect(within(form).getByLabelText('Stage index')).toBeEnabled();
      expect(within(form).getByLabelText('Stage index')).toHaveValue(1);
      expect(within(form).getByLabelText('Series index')).toHaveValue(3);
      expect(within(form).getByLabelText('Shots already recorded')).toHaveValue(2);
      expect(within(form).getByLabelText('Observed facts')).toHaveValue(
        'Possible firearm malfunction declared by Lane.',
      );
      expect(
        within(form).getByText(
          'Stage, series, and shot count come from the selected Lane. Correct them if you are recording an earlier incident. Director checks claim limits and remedies against the event rules.',
        ),
      ).toBeInTheDocument();
    });

    it('ignores Lane declarations for another competition or participant', async () => {
      const base = signal()!;
      await renderLoaded({
        lanes: [
          lane({
            qualificationMalfunctionSignal: {
              ...base,
              context: { ...base.context!, competitionId: OTHER_COMPETITION_ID },
            },
          }),
        ],
      });
      expect(screen.queryByText('Lane declarations')).not.toBeInTheDocument();
    });

    it('marks a declaration whose case is already open and clears the selected declaration after opening', async () => {
      service.listByCompetition.mockResolvedValue(ok([]));
      service.create.mockResolvedValue(
        ok(malfunctionCase({ id: CREATED_ID, reportSource: 'LANE_SIGNAL', sourceSignalId: SIGNAL_ID })),
      );
      await renderLoaded({ lanes: [lane({ qualificationMalfunctionSignal: signal({ message: 'Trigger failed.' }) })] });
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Use Lane declaration' }));
      fillCreate('Trigger failed.', 'RO A');
      fireEvent.click(within(createForm()).getByRole('button', { name: 'Open malfunction case' }));

      expect(await screen.findByText('Official case already opened')).toHaveAttribute(
        'class',
        'font-medium text-vscode-success',
      );
      expect(screen.queryByText(/Lane declaration selected/)).not.toBeInTheDocument();
      expect(within(createForm()).getByLabelText('Stage index')).toBeEnabled();
      expect(within(createForm()).getByLabelText('Observed facts')).toHaveValue('');
      expect(within(detail()).getByText(`Lane declaration: ${SIGNAL_ID}`)).toBeInTheDocument();
    });
  });

  describe('case detail', () => {
    it('shows the case facts, the rule sources and the append-only history', async () => {
      service.listByCompetition.mockResolvedValue(
        ok([
          malfunctionCase({
            status: 'CLASSIFIED',
            claimAssessment: {
              allowed: false,
              maximumInScope: 1,
              maximumInExceptionalPart: null,
              reason: 'SCOPE_LIMIT_REACHED',
            },
            seriesShotLimit: null,
            entries: [
              entry({ type: 'INSPECTION_RECORDED' }),
              entry({
                id: 'e2e2e2e2-e2e2-4e2e-8e2e-e2e2e2e2e2e2',
                type: 'CLASSIFIED',
                officialRole: 'JURY_MEMBER',
                classification: 'ALLOWABLE',
                causeCode: 'AMMUNITION',
                ruleReference: '8.9.1',
                statement: 'Ammunition failure confirmed.',
              }),
            ],
          }),
        ]),
      );
      await renderLoaded();
      const view = detail();

      const facts = [...view.querySelectorAll('div.grid > div')].map((fact) => fact.textContent);
      expect(facts).toEqual([
        'StatusClassified',
        'Athlete101 · Athlete A',
        'Firing contextFP 7 · relay 2',
        'Course contextMatch · stage 2 · series 4',
        'Claim modeClaim',
        'Report sourceDirector manual',
        'Claim assessmentUnavailable · Scope limit reached',
        'Recorded shots2/unlimited',
        'TreatmentComplete remaining shots',
      ]);
      expect(within(view).getByText('Rule source: Local policy snapshot')).toBeInTheDocument();
      expect(within(view).getByText('References: 8.9.1, 8.9.4')).toBeInTheDocument();
      expect(within(view).getByText('Required records: RANGE_INCIDENT_REPORT / RFPM')).toBeInTheDocument();
      expect(within(view).queryByText(/^Lane declaration:/)).not.toBeInTheDocument();
      const history = [...view.querySelectorAll('ol > li')].map((item) => item.textContent);
      expect(history).toEqual([
        'Inspection recorded · RO A (Range officer)Pistol inspected at the firing point.',
        'Classified · RO A (Jury member)Ammunition failure confirmed.ALLOWABLE · AMMUNITIONISSF 8.9.1',
      ]);
    });

    it('shows the Rule Pack, a missing start number and the sighting policy', async () => {
      service.listByCompetition.mockResolvedValue(
        ok([
          malfunctionCase({
            rulePackIdentity: {
              id: 'ISSF:2026:RFPM:QUALIFICATION',
              schemaVersion: 1,
              fingerprint: { algorithm: 'SHA-256', value: 'a'.repeat(64) },
            },
            startNumberSnapshot: null,
            stageId: null,
            phase: 'SIGHTING',
            reportSource: 'LANE_SIGNAL',
            sourceSignalId: SIGNAL_ID,
          }),
        ]),
      );
      await renderLoaded();
      const view = detail();

      expect(within(view).getByText('-- · Athlete A')).toBeInTheDocument();
      expect(within(view).getByText('Sighting · stage 2 · series 4')).toBeInTheDocument();
      expect(within(view).getByText('Sighting policy')).toBeInTheDocument();
      expect(within(view).getByText('Lane signal')).toBeInTheDocument();
      expect(within(view).getByText('Rule source: ISSF:2026:RFPM:QUALIFICATION')).toBeInTheDocument();
      expect(within(view).getByText(`Lane declaration: ${SIGNAL_ID}`)).toBeInTheDocument();
      expect(within(view).getByText('No entries yet.')).toBeInTheDocument();
    });

    it.each([
      ['OPEN', [], policy(), ['Note', 'Inspection recorded', 'Void']],
      ['INSPECTED', [], policy(), ['Note', 'Inspection recorded', 'Classified', 'Void']],
      [
        'CLASSIFIED',
        [classified('ALLOWABLE')],
        policy(),
        ['Note', 'Classified', 'Repair started', 'Remedy authorized', 'Void'],
      ],
      ['CLASSIFIED', [classified('NON_ALLOWABLE')], policy(), ['Note', 'Classified', 'Remedy authorized', 'Void']],
      ['REPAIRING', [], policy(), ['Note', 'Repair extended', 'Repair completed', 'Void']],
      [
        'REPAIRING',
        [],
        policy({ repair: { ...policy().repair, juryMayExtend: false } }),
        ['Note', 'Repair completed', 'Void'],
      ],
      ['REPAIRED', [], policy(), ['Note', 'Remedy authorized', 'Void']],
      ['RECOVERY_AUTHORIZED', [], policy(), ['Note', 'Remedy authorized', 'Execution recorded', 'Void']],
      ['EXECUTED', [], policy(), ['Note', 'Score settled', 'Void']],
      ['SETTLED', [], policy(), ['Note', 'Completed', 'Void']],
      ['COMPLETED', [], policy(), ['Note', 'Void']],
    ] as const)('offers the entry types a %s case allows', async (status, entries, policySnapshot, expected) => {
      service.listByCompetition.mockResolvedValue(
        ok([malfunctionCase({ status, entries: [...entries], policySnapshot })]),
      );
      await renderLoaded();

      expect(optionTexts(within(appendForm()).getByLabelText('Entry type'))).toEqual(expected);
      expect(within(appendForm()).getByLabelText('Entry type')).toHaveValue('NOTE');
      expect(optionTexts(within(appendForm()).getByLabelText('Official role'))).toEqual([
        'Range officer',
        'Cro',
        'Jury member',
        'Rts officer',
        'Technical officer',
      ]);
    });

    it('hides the entry form for a void case', async () => {
      service.listByCompetition.mockResolvedValue(ok([malfunctionCase({ status: 'VOID' })]));
      await renderLoaded();

      expect(within(detail()).getByText('No entries yet.')).toBeInTheDocument();
      expect(screen.queryByText('Append an official entry')).not.toBeInTheDocument();
    });

    it.each([
      [
        'a documentation-only record',
        { claimMode: 'DOCUMENTATION_ONLY' as const },
        'No further action · 0 shots',
        {
          remedy: 'NO_FURTHER_ACTION',
          shotsToFire: 0,
        },
      ],
      [
        'a non-allowable ruling',
        { entries: [classified('NON_ALLOWABLE')] },
        'Score unfired as miss · 0 shots',
        {
          remedy: 'SCORE_UNFIRED_AS_MISS',
          shotsToFire: 0,
        },
      ],
      [
        'the latest ruling',
        { entries: [classified('NON_ALLOWABLE'), classified('ALLOWABLE', 'e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3')] },
        'Complete remaining shots · 8 shots',
        { remedy: 'COMPLETE_REMAINING_SHOTS', shotsToFire: 8 },
      ],
      [
        'a sighting malfunction',
        { phase: 'SIGHTING' as const, entries: [classified('ALLOWABLE')] },
        'Continue within original time · 0 shots',
        { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME', shotsToFire: 0 },
      ],
      [
        'a stage that continues',
        { stageId: 'STAGE_3', entries: [classified('ALLOWABLE')] },
        'Continue within original time · 0 shots',
        { remedy: 'CONTINUE_WITHIN_ORIGINAL_TIME', shotsToFire: 0 },
      ],
      [
        'a stage that repeats the series',
        { stageId: 'STAGE_2', entries: [classified('ALLOWABLE')] },
        'Repeat full series · 5 shots',
        { remedy: 'REPEAT_FULL_SERIES', shotsToFire: 5 },
      ],
    ])('authorizes the remedy the rules require for %s', async (_name, overrides, fact, payload) => {
      const changed = malfunctionCase({ ...overrides, status: 'RECOVERY_AUTHORIZED' });
      service.listByCompetition.mockResolvedValue(ok([malfunctionCase({ status: 'REPAIRED', ...overrides })]));
      service.appendEntry.mockResolvedValue(ok(changed));
      await renderLoaded();
      fillAppend('REMEDY_AUTHORIZED');

      const required = within(appendForm()).getByText('Rule-required remedy').parentElement;
      expect(required).toHaveTextContent(`Rule-required remedy${fact}`);
      fireEvent.click(within(appendForm()).getByRole('button', { name: 'Append entry' }));

      await waitFor(() =>
        expect(service.appendEntry).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          type: 'REMEDY_AUTHORIZED',
          statement: 'Recorded at the line.',
          officialName: 'Jury B',
          officialRole: 'RANGE_OFFICER',
          ...payload,
        }),
      );
    });

    it.each([
      ['no ruling', {}],
      ['no series shot limit', { seriesShotLimit: null, entries: [classified('ALLOWABLE')] }],
      ['an unknown stage', { stageId: 'STAGE_9', entries: [classified('ALLOWABLE')] }],
    ])('cannot authorize a remedy with %s', async (_name, overrides) => {
      service.listByCompetition.mockResolvedValue(ok([malfunctionCase({ status: 'REPAIRED', ...overrides })]));
      await renderLoaded();
      fillAppend('REMEDY_AUTHORIZED');

      expect(within(appendForm()).queryByText('Rule-required remedy')).not.toBeInTheDocument();
      expect(within(appendForm()).getByRole('button', { name: 'Append entry' })).toBeDisabled();
    });

    it('classifies with the causes of the chosen classification', async () => {
      service.listByCompetition.mockResolvedValue(ok([malfunctionCase({ status: 'INSPECTED' })]));
      service.appendEntry.mockResolvedValue(ok(malfunctionCase({ status: 'CLASSIFIED' })));
      await renderLoaded();
      fillAppend('CLASSIFIED');
      const form = appendForm();

      expect(within(form).getByLabelText('Official classification')).toHaveValue('ALLOWABLE');
      expect(optionTexts(within(form).getByLabelText('Inspected cause'))).toEqual([
        'Ammunition failure (8.9.1)',
        'Broken spring (8.9.2)',
      ]);
      fireEvent.change(within(form).getByLabelText('Inspected cause'), { target: { value: 'SPRING' } });
      fireEvent.change(within(form).getByLabelText('Official classification'), { target: { value: 'NON_ALLOWABLE' } });
      expect(optionTexts(within(form).getByLabelText('Inspected cause'))).toEqual(['Athlete error (8.9.3)']);
      expect(within(form).getByLabelText('Inspected cause')).toHaveValue('ATHLETE');
      fireEvent.change(within(form).getByLabelText('Official role'), { target: { value: 'CRO' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Append entry' }));

      await waitFor(() =>
        expect(service.appendEntry).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          type: 'CLASSIFIED',
          statement: 'Recorded at the line.',
          officialName: 'Jury B',
          officialRole: 'CRO',
          classification: 'NON_ALLOWABLE',
          causeCode: 'ATHLETE',
        }),
      );
    });

    it('extends a repair as a Jury member and clears the extension after it is recorded', async () => {
      service.listByCompetition.mockResolvedValue(ok([malfunctionCase({ status: 'REPAIRING' })]));
      service.appendEntry.mockResolvedValue(ok(malfunctionCase({ status: 'REPAIRING', summary: 'Extended.' })));
      await renderLoaded();
      fillAppend('REPAIR_EXTENDED');
      const form = appendForm();
      const button = within(form).getByRole('button', { name: 'Append entry' });

      expect(within(form).getByLabelText('Official role')).toHaveValue('JURY_MEMBER');
      expect(button).toBeDisabled();
      fireEvent.change(within(form).getByLabelText('Extension seconds'), { target: { value: '0' } });
      expect(button).toBeDisabled();
      fireEvent.change(within(form).getByLabelText('Extension seconds'), { target: { value: '90' } });
      expect(button).toBeEnabled();
      fireEvent.click(button);

      await waitFor(() =>
        expect(service.appendEntry).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          type: 'REPAIR_EXTENDED',
          statement: 'Recorded at the line.',
          officialName: 'Jury B',
          officialRole: 'JURY_MEMBER',
          repairSeconds: 90,
        }),
      );
      await waitFor(() => expect(within(detail()).getByText('Extended.')).toBeInTheDocument());
      expect(within(appendForm()).getByLabelText('Extension seconds')).toHaveValue(null);
      expect(within(appendForm()).getByLabelText('Statement')).toHaveValue('');
      expect(within(appendForm()).getByLabelText('Official name')).toHaveValue('Jury B');
      expect(within(appendForm()).getByLabelText('Entry type')).toHaveValue('REPAIR_EXTENDED');
    });

    it.each([
      ['EXECUTED', 'SCORE_SETTLED', 'RTS_OFFICER'],
      ['RECOVERY_AUTHORIZED', 'EXECUTION_RECORDED', 'RANGE_OFFICER'],
    ] as const)('requires saved evidence for a %s case entry %s', async (status, type, role) => {
      service.listByCompetition.mockResolvedValue(ok([malfunctionCase({ status })]));
      service.appendEntry.mockResolvedValue(ok(malfunctionCase({ status })));
      await renderLoaded();
      fillAppend(type);
      const form = appendForm();
      const button = within(form).getByRole('button', { name: 'Append entry' });

      expect(within(form).getByLabelText('Official role')).toHaveValue(role);
      expect(button).toBeDisabled();
      fireEvent.change(within(form).getByLabelText('Saved evidence reference'), { target: { value: ' ' } });
      expect(button).toBeDisabled();
      fireEvent.change(within(form).getByLabelText('Saved evidence reference'), { target: { value: 'sheet-1' } });
      fireEvent.click(button);

      await waitFor(() =>
        expect(service.appendEntry).toHaveBeenCalledWith({
          caseId: FIRST_ID,
          type,
          statement: 'Recorded at the line.',
          officialName: 'Jury B',
          officialRole: role,
          artifactId: 'sheet-1',
        }),
      );
      await waitFor(() => expect(within(appendForm()).getByLabelText('Saved evidence reference')).toHaveValue(''));
    });

    it('replaces the changed case and resets an entry type its new status no longer allows', async () => {
      service.listByCompetition.mockResolvedValue(
        ok([malfunctionCase({ status: 'RECOVERY_AUTHORIZED' }), secondCase()]),
      );
      const pending = deferred<CaseResponse>();
      service.appendEntry.mockReturnValueOnce(pending.promise);
      await renderLoaded();
      fireEvent.click(row(/^FP 7 · Athlete A/));
      fillAppend('EXECUTION_RECORDED');
      fireEvent.change(within(appendForm()).getByLabelText('Saved evidence reference'), {
        target: { value: 'sheet-1' },
      });
      fireEvent.click(within(appendForm()).getByRole('button', { name: 'Append entry' }));

      expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
      expect(within(appendForm()).getByRole('button', { name: 'Append entry' })).toBeDisabled();
      expect(within(createForm()).getByRole('button', { name: 'Open malfunction case' })).toBeDisabled();

      await act(async () =>
        pending.resolve(ok(malfunctionCase({ status: 'EXECUTED', entries: [entry({ type: 'EXECUTION_RECORDED' })] }))),
      );

      expect(row(/^FP 7 · Athlete A/)).toHaveTextContent('FP 7 · Athlete AExecuted · Claim · Projectile lodged.');
      expect(row(/^FP 7 · Athlete A/)).toHaveClass('bg-vscode-highlight');
      expect(screen.getAllByRole('button', { name: /^FP \d/ })).toHaveLength(2);
      expect(within(appendForm()).getByLabelText('Entry type')).toHaveValue('NOTE');
      expect(optionTexts(within(appendForm()).getByLabelText('Entry type'))).toEqual(['Note', 'Score settled', 'Void']);
      expect(within(appendForm()).getByLabelText('Statement')).toHaveValue('');
      expect(within(appendForm()).getByLabelText('Official name')).toHaveValue('Jury B');
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
      expect(service.listByCompetition).toHaveBeenCalledTimes(1);
    });

    it.each([
      [
        'a failed response',
        () => service.appendEntry.mockResolvedValue(fail('Only an open case can be inspected')),
        'Only an open case can be inspected',
      ],
      ['a rejected value', () => service.appendEntry.mockRejectedValue('bridge closed'), 'bridge closed'],
    ])('shows %s of an entry in the panel error and keeps the draft', async (_name, failAppend, message) => {
      failAppend();
      await renderLoaded();
      fillAppend('NOTE');
      fireEvent.click(within(appendForm()).getByRole('button', { name: 'Append entry' }));

      await waitFor(() => expect(errorBanner()).toHaveTextContent(new RegExp(`^${message}$`)));
      expect(within(appendForm()).getByLabelText('Statement')).toHaveValue('Recorded at the line.');
      expect(within(appendForm()).getByRole('button', { name: 'Append entry' })).toBeEnabled();
    });

    it('discards the entry draft when another case is selected', async () => {
      await renderLoaded();
      fillAppend('NOTE', 'Draft for B');
      fireEvent.click(row(/^FP 7 · Athlete A/));
      expect(within(appendForm()).getByLabelText('Statement')).toHaveValue('');
      fireEvent.click(row(/^FP 8 · Athlete B/));
      expect(within(appendForm()).getByLabelText('Statement')).toHaveValue('');
      expect(within(appendForm()).getByLabelText('Official name')).toHaveValue('');
    });

    it('disables the commands but not refresh when the panel is disabled', async () => {
      await renderLoaded({ disabled: true });
      fillCreate();
      fillAppend('NOTE');

      expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
      expect(within(createForm()).getByRole('button', { name: 'Open malfunction case' })).toBeDisabled();
      expect(within(appendForm()).getByRole('button', { name: 'Append entry' })).toBeDisabled();
    });
  });
});
