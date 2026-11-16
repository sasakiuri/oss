import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinalOperationPanel } from '@/renderer/presentation/features/final-operations/FinalOperationPanel';
import { finalOperationsService, mqttService } from '@/renderer/services';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';
import {
  COMPETITION_ID,
  CONFIRMATION_ID,
  LANE_A,
  LANE_B,
  LANE_C,
  LANE_D,
  LANE_E,
  LANE_F,
  RUN_ID,
  executed,
  finalRun,
  laneSnapshot,
  roundClosedEntry,
  scriptStep,
  shootOff,
  shootOffShot,
  stepProjection,
} from './finalOperationFixtures';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { getByCompetition, startShootOff, closeShootOffRound, recordExecution } = vi.mocked(finalOperationsService);
const { executeFinalScriptStep } = vi.mocked(mqttService);

const checkpoint = scriptStep({
  id: 'checkpoint-10',
  kind: 'CHECK',
  text: 'Check for a tie on the low score',
  effect: { type: 'CHECKPOINT', afterMatchShot: 10 },
});
const atCheckpoint = (overrides: Parameters<typeof finalRun>[1] = {}) =>
  finalRun(stepProjection(checkpoint), overrides);

const individualLanes = [
  laneSnapshot(LANE_A, 1, { name: 'Athlete A', startNumber: 1 }),
  laneSnapshot(LANE_B, 2, { name: 'Athlete B', startNumber: 2 }),
  laneSnapshot(LANE_C, 3, { name: 'Athlete C', startNumber: 3 }, { finished: true }),
  laneSnapshot(LANE_D, 4),
];

function renderPanel(props: Partial<ComponentProps<typeof FinalOperationPanel>> = {}) {
  return render(
    <FinalOperationPanel
      competitionId={COMPETITION_ID}
      competitionTypeId="AR10_FINAL"
      competitorUnit="INDIVIDUAL"
      phase="MATCH"
      lanes={individualLanes}
      {...props}
    />,
  );
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FinalOperationPanel shoot-off branch', () => {
  it('offers the active Finalists and starts a shoot-off for the selected ones', async () => {
    getByCompetition.mockResolvedValue(ok(atCheckpoint()));
    startShootOff.mockResolvedValue(
      ok(
        finalRun(stepProjection(scriptStep({ id: 'so-load', text: 'Shoot-off LOAD' })), {
          currentBranch: 'SHOOT_OFF',
          shootOff: shootOff({ iteration: 1 }),
        }),
      ),
    );
    renderPanel();
    await screen.findByText('Shoot-off branch (only when the low score is tied)');
    expect(
      screen.getByText(
        'Select only the tied Finalists. Shoot-off shots are kept outside the normal MATCH score and attached to this checkpoint.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Athlete C/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('FP 4')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Skip with reason' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('FP 2 · Athlete B'));
    expect(screen.getByRole('button', { name: 'Start shoot-off branch (1 Finalists)' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('FP 1 · Athlete A'));
    expect(screen.getByRole('button', { name: 'Start shoot-off branch (2 Finalists)' })).toBeDisabled();
    type('Confirmation / exception note', '  Tie on 98.4  ');
    fireEvent.click(screen.getByRole('button', { name: 'Start shoot-off branch (2 Finalists)' }));

    expect(await screen.findByText('Shoot-off LOAD')).toBeInTheDocument();
    expect(screen.getByText('Shoot-off round 1')).toBeInTheDocument();
    expect(startShootOff).toHaveBeenCalledWith({
      runId: RUN_ID,
      checkpointStepId: 'checkpoint-10',
      eligibleLaneIds: [LANE_A, LANE_B],
      units: [
        { unitId: LANE_A, label: 'FP 1 · Athlete A', laneIds: [LANE_A] },
        { unitId: LANE_B, label: 'FP 2 · Athlete B', laneIds: [LANE_B] },
      ],
      reason: 'Tie on 98.4',
      officialName: 'Jury Chair',
    });
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('');
  });

  it('shows a failed shoot-off start and keeps the selection', async () => {
    getByCompetition.mockResolvedValue(ok(atCheckpoint()));
    startShootOff.mockResolvedValue(fail('Shoot-off Lanes must be tied'));
    renderPanel();
    await screen.findByText('Shoot-off branch (only when the low score is tied)');
    fireEvent.click(screen.getByLabelText('FP 1 · Athlete A'));
    fireEvent.click(screen.getByLabelText('FP 2 · Athlete B'));
    type('Confirmation / exception note', 'Tie on 98.4');

    fireEvent.click(screen.getByRole('button', { name: 'Start shoot-off branch (2 Finalists)' }));

    expect(await screen.findByText('Shoot-off Lanes must be tied')).toHaveAttribute(
      'class',
      'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error',
    );
    expect(screen.getByLabelText('FP 1 · Athlete A')).toBeChecked();
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('Tie on 98.4');
  });

  it('groups Mixed Team Lanes by team and blocks incomplete teams', async () => {
    getByCompetition.mockResolvedValue(ok(atCheckpoint()));
    startShootOff.mockResolvedValue(fail('Stop here'));
    renderPanel({
      competitorUnit: 'MIXED_TEAM',
      lanes: [
        laneSnapshot(LANE_A, 1, { name: 'Athlete A', startNumber: 1, teamId: 'T1' }),
        laneSnapshot(LANE_B, 2, { name: 'Athlete B', startNumber: 2, teamId: 'T1', teamName: 'Japan 1' }),
        laneSnapshot(LANE_C, 3, { name: 'Athlete C', startNumber: 3, teamId: 'T2' }),
        laneSnapshot(LANE_D, 4, { name: 'Athlete D', startNumber: 4 }),
        laneSnapshot(LANE_E, 5, { name: 'Athlete E', startNumber: 5, teamId: 'T3', teamName: 'Korea 1' }),
        laneSnapshot(LANE_F, 6, { name: 'Athlete F', startNumber: 6, teamId: 'T3' }),
      ],
    });
    await screen.findByText(/^Select only the tied Teams\./);

    const labels = screen.getAllByRole('checkbox').map((checkbox) => checkbox.closest('label')?.textContent ?? '');
    expect(labels).toEqual([
      'Japan 1',
      'T2Mixed Team must have exactly two active Lanes (1 found)',
      'Korea 1',
      'FP 4 · Athlete DOfficial Mixed Team ID is missing',
    ]);
    expect(screen.getByText('Mixed Team must have exactly two active Lanes (1 found)')).toHaveClass(
      'block text-vscode-warning',
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.map((checkbox) => (checkbox as HTMLInputElement).disabled)).toEqual([false, true, false, true]);

    fireEvent.click(checkboxes[2]!);
    fireEvent.click(checkboxes[0]!);
    type('Confirmation / exception note', 'Team tie');
    fireEvent.click(screen.getByRole('button', { name: 'Start shoot-off branch (2 Teams)' }));

    await screen.findByText('Stop here');
    expect(startShootOff).toHaveBeenCalledWith({
      runId: RUN_ID,
      checkpointStepId: 'checkpoint-10',
      eligibleLaneIds: [LANE_A, LANE_B, LANE_E, LANE_F],
      units: [
        { unitId: 'T1', label: 'Japan 1', laneIds: [LANE_A, LANE_B] },
        { unitId: 'T3', label: 'Korea 1', laneIds: [LANE_E, LANE_F] },
      ],
      reason: 'Team tie',
      officialName: 'Jury Chair',
    });
  });

  it.each([
    { name: 'a step other than a checkpoint', run: () => finalRun(stepProjection(scriptStep({ text: 'Step' }))) },
    {
      name: 'a checkpoint in the shoot-off branch',
      run: () => atCheckpoint({ currentBranch: 'SHOOT_OFF', shootOff: shootOff() }),
    },
    { name: 'a finished run', run: () => atCheckpoint({ status: 'COMPLETED' }) },
  ])('offers no shoot-off branch at $name', async ({ run }) => {
    getByCompetition.mockResolvedValue(ok(run()));
    renderPanel();
    await screen.findByRole('button', { name: 'Abort run' });

    expect(screen.queryByText('Shoot-off branch (only when the low score is tied)')).not.toBeInTheDocument();
  });

  it('executes shoot-off steps in the shoot-off branch and iteration', async () => {
    const load = scriptStep({
      id: 'so-load',
      text: 'Shoot-off LOAD',
      effect: { type: 'LOAD', purpose: 'SHOOT_OFF', participantSelection: 'TIED_ONLY' },
    });
    const awaiting = stepProjection(load, { status: 'AWAITING_EXECUTION', confirmationEntryId: CONFIRMATION_ID });
    getByCompetition.mockResolvedValue(
      ok(finalRun(awaiting, { currentBranch: 'SHOOT_OFF', shootOff: shootOff({ iteration: 3 }) })),
    );
    executeFinalScriptStep.mockResolvedValue(executed());
    recordExecution.mockResolvedValue(fail('Stop here'));
    renderPanel();
    await screen.findByText('Shoot-off LOAD');

    fireEvent.click(screen.getByRole('button', { name: 'Retry execution' }));

    await screen.findByText('Stop here');
    expect(executeFinalScriptStep).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      runId: RUN_ID,
      confirmationEntryId: CONFIRMATION_ID,
      branch: 'SHOOT_OFF',
      iteration: 3,
      step: load,
    });
  });
});

describe('FinalOperationPanel shoot-off resolution', () => {
  const awaitingResolution = (shots: ReturnType<typeof shootOffShot>[]) =>
    finalRun(null, {
      currentBranch: 'SHOOT_OFF',
      shootOff: shootOff({ iteration: 2, shotsPerLane: 2, status: 'AWAITING_RESOLUTION', shots }),
    });

  it('shows each unit total and its Lane shots', async () => {
    getByCompetition.mockResolvedValue(
      ok(awaitingResolution([shootOffShot(LANE_A, 105, 1), shootOffShot(LANE_A, 98, 2), shootOffShot(LANE_B, 101, 3)])),
    );
    renderPanel({ lanes: [individualLanes[0]!] });

    expect(await screen.findByText('Resolve shoot-off round 2')).toBeInTheDocument();
    expect(screen.getByText('Shoot-off round 2')).toBeInTheDocument();
    expect(screen.getByText('20.3 total')).toHaveClass('font-semibold text-vscode-text');
    expect(screen.getByText('Waiting for shot(s)')).toHaveClass('text-vscode-warning');
    expect(screen.getByText('FP 1 · Athlete A · 10.5, 9.8 (2/2)')).toBeInTheDocument();
    expect(screen.getByText('bbbbbbbb · 10.1 (1/2)')).toBeInTheDocument();
    expect(screen.queryByText(/This run is/)).not.toBeInTheDocument();
    type('Resolution note', 'All shots in');
    expect(screen.getByRole('button', { name: 'Calculate and return to checkpoint' })).toBeDisabled();
  });

  it('shows a Lane without shots as waiting', async () => {
    getByCompetition.mockResolvedValue(ok(awaitingResolution([])));
    renderPanel();

    expect(await screen.findByText('FP 2 · Athlete B · waiting (0/2)')).toBeInTheDocument();
  });

  it('closes the round and selects the units that remain tied', async () => {
    const shots = [
      shootOffShot(LANE_A, 100, 1),
      shootOffShot(LANE_A, 100, 2),
      shootOffShot(LANE_B, 100, 3),
      shootOffShot(LANE_B, 100, 4),
    ];
    getByCompetition.mockResolvedValue(ok(awaitingResolution(shots)));
    closeShootOffRound.mockResolvedValue(
      ok(
        atCheckpoint({
          entries: [
            roundClosedEntry({
              remainingTiedUnitIds: [LANE_A, LANE_B],
              unitScores: [
                { unitId: LANE_A, label: 'Finalist A', laneIds: [LANE_A], scoreX10: 200 },
                { unitId: LANE_B, label: 'Finalist B', laneIds: [LANE_B], scoreX10: 200 },
              ],
            }),
          ],
        }),
      ),
    );
    renderPanel();
    await screen.findByText('Resolve shoot-off round 2');
    expect(screen.getByRole('button', { name: 'Calculate and return to checkpoint' })).toBeDisabled();
    type('Resolution note', '  Still tied  ');
    type('Official name', ' Jury Chair ');

    fireEvent.click(screen.getByRole('button', { name: 'Calculate and return to checkpoint' }));

    expect(await screen.findByText('Tie remains between Finalist A, Finalist B.')).toBeInTheDocument();
    expect(closeShootOffRound).toHaveBeenCalledWith({
      runId: RUN_ID,
      statement: 'Still tied',
      officialName: 'Jury Chair',
    });
    expect(screen.getByLabelText('FP 1 · Athlete A')).toBeChecked();
    expect(screen.getByLabelText('FP 2 · Athlete B')).toBeChecked();
    expect(screen.getByLabelText('FP 4')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Start shoot-off branch (2 Finalists)' })).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('');
  });

  it('shows a failed round close and keeps the note', async () => {
    getByCompetition.mockResolvedValue(
      ok(
        awaitingResolution([
          shootOffShot(LANE_A, 100, 1),
          shootOffShot(LANE_A, 100, 2),
          shootOffShot(LANE_B, 100, 3),
          shootOffShot(LANE_B, 99, 4),
        ]),
      ),
    );
    closeShootOffRound.mockResolvedValue(fail('Shots are still arriving'));
    renderPanel();
    await screen.findByText('Resolve shoot-off round 2');
    type('Resolution note', 'Done');

    fireEvent.click(screen.getByRole('button', { name: 'Calculate and return to checkpoint' }));

    expect(await screen.findByText('Shots are still arriving')).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution note')).toHaveValue('Done');
  });

  it('offers abort while the round awaits resolution', async () => {
    getByCompetition.mockResolvedValue(ok(awaitingResolution([])));
    renderPanel();
    await screen.findByText('Resolve shoot-off round 2');

    expect(screen.getByRole('button', { name: 'Abort run' })).toBeDisabled();
    type('Resolution note', 'Range unsafe');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abort run' })).toBeEnabled());
  });
});

describe('FinalOperationPanel previous shoot-off outcome', () => {
  it.each([
    {
      name: 'the recorded label of the eliminated unit',
      metadata: { eliminatedUnitId: LANE_B, eliminatedUnitLabel: 'Finalist B', remainingTiedUnitIds: [] },
      text: 'Previous round resolved: Finalist B had the unique lowest aggregate.',
    },
    {
      name: 'the unit score label of the eliminated unit',
      metadata: {
        eliminatedUnitId: LANE_B,
        unitScores: [{ unitId: LANE_B, label: 'Score label B', laneIds: [LANE_B], scoreX10: 98 }],
      },
      text: 'Previous round resolved: Score label B had the unique lowest aggregate.',
    },
    {
      name: 'the Lane label of a legacy eliminated Lane',
      metadata: { eliminatedLaneId: LANE_B, eliminatedUnitId: 42 },
      text: 'Previous round resolved: FP 2 · Athlete B had the unique lowest aggregate.',
    },
    {
      name: 'the short ID of an unknown eliminated unit',
      metadata: { eliminatedUnitId: LANE_E },
      text: 'Previous round resolved: eeeeeeee had the unique lowest aggregate.',
    },
    {
      name: 'the unit score labels of the tied units',
      metadata: {
        remainingTiedUnitIds: [LANE_A, LANE_B],
        unitScores: [
          { unitId: LANE_A, label: 'Score A', laneIds: [LANE_A], scoreX10: 99 },
          { unitId: LANE_B, label: 'Score B', laneIds: [LANE_B], scoreX10: 99 },
        ],
      },
      text: 'Tie remains between Score A, Score B.',
    },
    {
      name: 'the Lane labels of legacy tied Lanes',
      metadata: { remainingTiedLaneIds: [LANE_A, 7, LANE_B] },
      text: 'Tie remains between FP 1 · Athlete A, FP 2 · Athlete B.',
    },
    {
      name: 'Lane labels when unit scores are malformed',
      metadata: {
        remainingTiedUnitIds: [LANE_A, 7],
        unitScores: [
          'Score A',
          null,
          [LANE_A],
          { unitId: LANE_A, label: 'Empty Lanes', laneIds: [], scoreX10: 99 },
          { unitId: LANE_A, label: 'Text score', laneIds: [LANE_A], scoreX10: '99' },
          { unitId: LANE_A, label: 7, laneIds: [LANE_A], scoreX10: 99 },
        ],
      },
      text: 'Tie remains between FP 1 · Athlete A.',
    },
    {
      name: 'an empty tie when the metadata names nobody',
      metadata: {},
      text: 'Tie remains between .',
    },
  ])('describes $name', async ({ metadata, text }) => {
    getByCompetition.mockResolvedValue(ok(atCheckpoint({ entries: [roundClosedEntry(metadata)] })));
    renderPanel();

    expect(await screen.findByText(text)).toHaveClass('mt-2 text-[11px] text-vscode-text-muted');
  });

  it('describes the latest closed round', async () => {
    getByCompetition.mockResolvedValue(
      ok(
        atCheckpoint({
          entries: [
            roundClosedEntry({ eliminatedUnitId: LANE_A, eliminatedUnitLabel: 'First round' }, 1),
            roundClosedEntry({ eliminatedUnitId: LANE_B, eliminatedUnitLabel: 'Second round' }, 2),
          ],
        }),
      ),
    );
    renderPanel();

    expect(
      await screen.findByText('Previous round resolved: Second round had the unique lowest aggregate.'),
    ).toBeInTheDocument();
  });

  it('describes nothing when the latest closed round has no metadata', async () => {
    getByCompetition.mockResolvedValue(
      ok(
        atCheckpoint({
          entries: [
            roundClosedEntry({ eliminatedUnitId: LANE_A, eliminatedUnitLabel: 'First round' }, 1),
            roundClosedEntry(null, 2),
          ],
        }),
      ),
    );
    renderPanel();
    await screen.findByText('Shoot-off branch (only when the low score is tied)');

    expect(screen.queryByText(/Previous round resolved|Tie remains/)).not.toBeInTheDocument();
  });
});
