import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FinalOperationPanel } from '@/renderer/presentation/features/final-operations/FinalOperationPanel';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { finalOperationsService, mqttService } from '@/renderer/services';
import { RULE_PACK_TARGET_RESET_REQUIREMENT_ID } from '@/shared/competitionTypes';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';
import {
  COMMAND_ID,
  COMPETITION_ID,
  CONFIRMATION_ID,
  EVENT_ID,
  LANE_A,
  LANE_B,
  LANE_C,
  LANE_D,
  RUN_ID,
  executed,
  executionAttempt,
  finalRun,
  laneSnapshot,
  scriptStep,
  stepProjection,
} from './finalOperationFixtures';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const { getByCompetition, create, confirmStep, recordExecution, skipStep, abort } = vi.mocked(finalOperationsService);
const { executeFinalScriptStep, clearFinalCue } = vi.mocked(mqttService);

const ABORT_CONFIRMATION =
  'Abort this Final command run and clear its Lane cue? This does not issue STOP. Confirm the range is stopped or otherwise safe first. The command history will be kept.';
const ERROR_BANNER_CLASS = 'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error';

const loadStep = scriptStep({
  id: 'load-match',
  text: 'LOAD',
  effect: { type: 'LOAD', purpose: 'MATCH', participantSelection: 'ALL_ACTIVE' },
});
const awaitingExecution = (step = loadStep, overrides: Parameters<typeof stepProjection>[1] = {}) =>
  stepProjection(step, {
    status: 'AWAITING_EXECUTION',
    confirmationEntryId: CONFIRMATION_ID,
    eligibleLaneIds: [LANE_A, LANE_B],
    ...overrides,
  });
const nextRun = () => finalRun(stepProjection(scriptStep({ id: 'start', text: 'START' })));

function renderPanel(props: Partial<ComponentProps<typeof FinalOperationPanel>> = {}) {
  return render(
    <FinalOperationPanel
      competitionId={COMPETITION_ID}
      competitionTypeId="AR10_FINAL"
      competitorUnit="INDIVIDUAL"
      phase="MATCH"
      lanes={[]}
      {...props}
    />,
  );
}

async function answerConfirm(confirmed: boolean): Promise<string> {
  await waitFor(() => expect(useConfirmDialogStore.getState().isOpen).toBe(true));
  const { message } = useConfirmDialogStore.getState();
  act(() => {
    if (confirmed) useConfirmDialogStore.getState().handleConfirm();
    else useConfirmDialogStore.getState().handleCancel();
  });
  return message;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  useConfirmDialogStore.setState({ isOpen: false, message: '', resolve: null });
});

describe('FinalOperationPanel run', () => {
  it('shows the run summary and the current step', async () => {
    const current = stepProjection(
      scriptStep({ actor: 'CRO', kind: 'CHECK', text: 'Check the targets', ruleReference: '6.17.1' }),
      {
        scheduledFor: '2026-11-16T01:00:00.000Z',
        executionAttempts: [executionAttempt('ERROR'), executionAttempt('TIMEOUT')],
      },
    );
    getByCompetition.mockResolvedValue(
      ok(
        finalRun(current, {
          scriptSource: { organization: 'ISSF', title: 'Final command script', version: '2026.1' },
          steps: [
            stepProjection(scriptStep({ id: 'call' }), { status: 'COMPLETED' }),
            stepProjection(scriptStep({ id: 'intro' }), { status: 'SKIPPED' }),
            current,
          ],
        }),
      ),
    );
    renderPanel();

    expect(await screen.findByText('Check the targets')).toBeInTheDocument();
    expect(screen.getByText('ISSF:2026:AR60:FINAL')).toBeInTheDocument();
    expect(screen.getByText('Script 1')).toBeInTheDocument();
    expect(screen.getByText('ISSF · 2026.1')).toHaveAttribute('title', 'Final command script');
    expect(screen.getByText('2/3 steps')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('CRO · CHECK · AWAITING CONFIRMATION')).toBeInTheDocument();
    expect(screen.getByText('ISSF 6.17.1')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-11-16T01:00:00.000Z').toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('Previous attempt: TIMEOUT · retry uses the same confirmation.')).toBeInTheDocument();
    expect(screen.getByLabelText('Official name')).toHaveValue('Jury Chair');
    expect(screen.queryByText(/Shoot-off round/)).not.toBeInTheDocument();
  });

  it('shows a failed load in the error banner and offers to create a run', async () => {
    getByCompetition.mockResolvedValue(fail('Director database is busy'));
    renderPanel();

    const banner = await screen.findByText('Director database is busy');
    expect(banner.tagName).toBe('DIV');
    expect(banner).toHaveAttribute('class', ERROR_BANNER_CLASS);
    expect(screen.getByRole('button', { name: 'Create command run' })).toBeDisabled();
  });

  it('reloads on Refresh and does not refresh in the background outside a shoot-off', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(loadStep))));
    renderPanel();
    await screen.findByText('LOAD');

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(getByCompetition).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    click('Refresh');
    await waitFor(() => expect(getByCompetition).toHaveBeenCalledTimes(2));
    expect(getByCompetition).toHaveBeenLastCalledWith({ competitionId: COMPETITION_ID });
  });

  it('describes a finished run as read-only', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(null, { status: 'COMPLETED' })));
    renderPanel();

    expect(
      await screen.findByText('This run is completed. Its command and execution audit remains read-only.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abort run' })).not.toBeInTheDocument();
  });
});

describe('FinalOperationPanel create', () => {
  it('starts the published start ten minutes from now', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 16, 9, 5, 30).getTime());
    getByCompetition.mockResolvedValue(ok(null));
    renderPanel();

    expect(await screen.findByLabelText('Published start')).toHaveValue('2026-11-16T09:15');
  });

  it('creates a run for the event from the published start and the official name', async () => {
    getByCompetition.mockResolvedValue(ok(null));
    create.mockResolvedValue(ok(finalRun(stepProjection(scriptStep({ text: 'Call the finalists' })))));
    renderPanel({ competitionTypeId: 'AR60_FINAL', eventId: EVENT_ID });
    fireEvent.change(await screen.findByLabelText('Published start'), { target: { value: '2026-11-16T10:30' } });
    expect(screen.getByRole('button', { name: 'Create command run' })).toBeDisabled();
    type('Official name', '  Jury Chair  ');

    click('Create command run');

    expect(await screen.findByText('Call the finalists')).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      competitionTypeId: 'AR60_FINAL',
      eventId: EVENT_ID,
      scheduledStartAt: new Date('2026-11-16T10:30').toISOString(),
      officialName: 'Jury Chair',
    });
  });

  it('creates a run without an event and keeps the form on failure', async () => {
    getByCompetition.mockResolvedValue(ok(null));
    create.mockResolvedValue(fail('A Final run already exists'));
    renderPanel();
    await screen.findByLabelText('Published start');
    type('Official name', 'Jury Chair');

    click('Create command run');

    expect(await screen.findByText('A Final run already exists')).toHaveAttribute('class', ERROR_BANNER_CLASS);
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('eventId');
    expect(screen.getByRole('button', { name: 'Create command run' })).toBeEnabled();
  });

  it('disables create when the panel is disabled', async () => {
    getByCompetition.mockResolvedValue(ok(null));
    renderPanel({ disabled: true });
    await screen.findByLabelText('Published start');
    type('Official name', 'Jury Chair');

    expect(screen.getByRole('button', { name: 'Create command run' })).toBeDisabled();
  });
});

describe('FinalOperationPanel confirm and execute', () => {
  it('confirms, executes and records the current step', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(loadStep))));
    confirmStep.mockResolvedValue(ok(finalRun(awaitingExecution())));
    executeFinalScriptStep.mockResolvedValue(executed());
    recordExecution.mockResolvedValue(ok(nextRun()));
    renderPanel();
    await screen.findByText('LOAD');
    type('Confirmation / exception note', '  Targets checked  ');
    type('Official name', ' Jury Chair ');

    click('Confirm and execute');

    expect(await screen.findByText('START')).toBeInTheDocument();
    expect(confirmStep).toHaveBeenCalledWith({
      runId: RUN_ID,
      stepId: 'load-match',
      statement: 'Targets checked',
      officialName: 'Jury Chair',
    });
    expect(executeFinalScriptStep).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      runId: RUN_ID,
      confirmationEntryId: CONFIRMATION_ID,
      branch: 'MAIN',
      iteration: 0,
      step: loadStep,
      eligibleLaneIds: [LANE_A, LANE_B],
    });
    expect(recordExecution).toHaveBeenCalledWith({
      runId: RUN_ID,
      confirmationEntryId: CONFIRMATION_ID,
      status: 'DONE',
      commandId: COMMAND_ID,
      statement: 'Lane cue published',
      officialName: 'Jury Chair',
    });
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('');
  });

  it('confirms without a statement when the note is empty', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(loadStep))));
    confirmStep.mockResolvedValue(fail('The step was already confirmed'));
    renderPanel();
    await screen.findByText('LOAD');

    click('Confirm and execute');

    expect(await screen.findByText('The step was already confirmed')).toHaveAttribute('class', ERROR_BANNER_CLASS);
    expect(confirmStep).toHaveBeenCalledWith({ runId: RUN_ID, stepId: 'load-match', officialName: 'Jury Chair' });
    expect(executeFinalScriptStep).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'every failed Lane timed out',
      status: 'TIMEOUT',
      result: {
        success: false,
        command: {
          commandId: COMMAND_ID,
          action: 'start-match' as const,
          success: false,
          lanes: [
            { laneId: LANE_A, status: 'done' as const },
            { laneId: LANE_B, status: 'timeout' as const },
          ],
        },
      },
      commandId: { commandId: COMMAND_ID },
    },
    {
      name: 'a failed Lane did not time out',
      status: 'ERROR',
      result: {
        success: false,
        command: {
          commandId: COMMAND_ID,
          action: 'start-match' as const,
          success: false,
          lanes: [
            { laneId: LANE_A, status: 'timeout' as const },
            { laneId: LANE_B, status: 'error' as const },
          ],
        },
      },
      commandId: { commandId: COMMAND_ID },
    },
    { name: 'no Lane command failed', status: 'TIMEOUT', result: { success: false, command: null }, commandId: {} },
    { name: 'the execution succeeded', status: 'DONE', result: { success: true, command: null }, commandId: {} },
  ])('records $status when $name', async ({ status, result, commandId }) => {
    getByCompetition.mockResolvedValue(ok(finalRun(awaitingExecution())));
    executeFinalScriptStep.mockResolvedValue(executed({ ...result, statement: 'Lane outcome' }));
    recordExecution.mockResolvedValue(ok(nextRun()));
    renderPanel();
    await screen.findByText('LOAD');

    click('Retry execution');

    await screen.findByText('START');
    expect(confirmStep).not.toHaveBeenCalled();
    expect(recordExecution).toHaveBeenCalledWith({
      runId: RUN_ID,
      confirmationEntryId: CONFIRMATION_ID,
      status,
      ...commandId,
      statement: 'Lane outcome',
      officialName: 'Jury Chair',
    });
  });

  it('retries execution without Lane IDs when the confirmation has none', async () => {
    getByCompetition.mockResolvedValue(
      ok(
        finalRun(awaitingExecution(loadStep, { eligibleLaneIds: [], executionAttempts: [executionAttempt('ERROR')] })),
      ),
    );
    executeFinalScriptStep.mockResolvedValue(executed());
    recordExecution.mockResolvedValue(ok(nextRun()));
    renderPanel();
    await screen.findByText('Previous attempt: ERROR · retry uses the same confirmation.');

    click('Retry execution');

    await screen.findByText('START');
    expect(executeFinalScriptStep).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      runId: RUN_ID,
      confirmationEntryId: CONFIRMATION_ID,
      branch: 'MAIN',
      iteration: 0,
      step: loadStep,
    });
  });

  it('records a failed Lane execution, applies the recorded run and shows the failure', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(loadStep))));
    confirmStep.mockResolvedValue(ok(finalRun(awaitingExecution())));
    executeFinalScriptStep.mockResolvedValue(fail('Lane broker is offline'));
    recordExecution.mockResolvedValue(
      ok(finalRun(awaitingExecution(loadStep, { executionAttempts: [executionAttempt('ERROR')] }))),
    );
    renderPanel();
    await screen.findByText('LOAD');
    type('Confirmation / exception note', 'Targets checked');

    click('Confirm and execute');

    expect(await screen.findByText('Lane broker is offline')).toHaveAttribute('class', ERROR_BANNER_CLASS);
    expect(recordExecution).toHaveBeenCalledWith({
      runId: RUN_ID,
      confirmationEntryId: CONFIRMATION_ID,
      status: 'ERROR',
      statement: 'Lane broker is offline',
      officialName: 'Jury Chair',
    });
    expect(screen.getByRole('button', { name: 'Retry execution' })).toBeEnabled();
    expect(screen.getByText('Previous attempt: ERROR · retry uses the same confirmation.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('Targets checked');
  });

  it('shows the record failure instead of a failed Lane execution', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(awaitingExecution())));
    executeFinalScriptStep.mockResolvedValue(fail('Lane broker is offline'));
    recordExecution.mockResolvedValue(fail('The run is closed'));
    renderPanel();
    await screen.findByText('LOAD');

    click('Retry execution');

    expect(await screen.findByText('The run is closed')).toBeInTheDocument();
    expect(screen.queryByText('Lane broker is offline')).not.toBeInTheDocument();
  });

  it('shows a record failure after a successful execution and keeps the note', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(awaitingExecution())));
    executeFinalScriptStep.mockResolvedValue(executed());
    recordExecution.mockResolvedValue(fail('The confirmation is stale'));
    renderPanel();
    await screen.findByText('LOAD');
    type('Confirmation / exception note', 'Retry after broker restart');

    click('Retry execution');

    expect(await screen.findByText('The confirmation is stale')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('Retry after broker restart');
  });

  it('applies a confirmed run whose step is not awaiting execution and reports it', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(loadStep))));
    confirmStep.mockResolvedValue(ok(finalRun(stepProjection(scriptStep({ id: 'next', text: 'Next check' })))));
    renderPanel();
    await screen.findByText('LOAD');

    click('Confirm and execute');

    expect(await screen.findByText('The confirmed Final step is not awaiting execution')).toHaveAttribute(
      'class',
      ERROR_BANNER_CLASS,
    );
    expect(screen.getByText('Next check')).toBeInTheDocument();
    expect(executeFinalScriptStep).not.toHaveBeenCalled();
  });

  it('refuses RESULTS ARE FINAL when the confirmation reaches the declaration without its confirmations', async () => {
    const declaration = scriptStep({ id: 'declare', text: 'RESULTS ARE FINAL', effect: { type: 'DECLARE_RESULTS' } });
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(loadStep))));
    confirmStep.mockResolvedValue(ok(finalRun(awaitingExecution(declaration))));
    renderPanel({ eventId: EVENT_ID });
    await screen.findByText('LOAD');

    click('Confirm and execute');

    expect(
      await screen.findByText('RESULTS ARE FINAL requires an event and both explicit confirmations'),
    ).toBeInTheDocument();
    expect(executeFinalScriptStep).not.toHaveBeenCalled();
  });
});

describe('FinalOperationPanel RESULTS ARE FINAL', () => {
  const declaration = scriptStep({
    id: 'declare',
    actor: 'ANNOUNCER',
    kind: 'DECLARATION',
    text: 'RESULTS ARE FINAL',
    effect: { type: 'DECLARE_RESULTS' },
  });
  const protestsLabel = 'All immediate Final protests and ties are resolved, as confirmed with the Control Room.';
  const resultsLabel = 'The current RTS result list, ranks, displayed identities, and approval are confirmed.';

  it('requires an event before the declaration', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(declaration))));
    renderPanel();
    await screen.findByText('Link this Final run to an event before declaring RESULTS ARE FINAL.');

    fireEvent.click(screen.getByLabelText(protestsLabel));
    fireEvent.click(screen.getByLabelText(resultsLabel));

    expect(screen.getByRole('button', { name: 'Confirm and execute' })).toBeDisabled();
  });

  it('declares with both confirmations and clears them afterwards', async () => {
    const repeated = scriptStep({ ...declaration, id: 'declare-again', text: 'RESULTS ARE FINAL (repeat)' });
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(declaration))));
    confirmStep.mockResolvedValue(ok(finalRun(awaitingExecution(declaration, { eligibleLaneIds: [] }))));
    executeFinalScriptStep.mockResolvedValue(executed({ command: null, declarationId: CONFIRMATION_ID }));
    recordExecution.mockResolvedValue(ok(finalRun(stepProjection(repeated))));
    renderPanel({ eventId: EVENT_ID });
    await screen.findByText('RESULTS ARE FINAL');
    expect(
      screen.queryByText('Link this Final run to an event before declaring RESULTS ARE FINAL.'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(protestsLabel));
    expect(screen.getByRole('button', { name: 'Confirm and execute' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(resultsLabel));
    click('Confirm and execute');

    expect(await screen.findByText('RESULTS ARE FINAL (repeat)')).toBeInTheDocument();
    expect(executeFinalScriptStep).toHaveBeenCalledWith({
      competitionId: COMPETITION_ID,
      runId: RUN_ID,
      confirmationEntryId: CONFIRMATION_ID,
      branch: 'MAIN',
      iteration: 0,
      step: declaration,
      declarationConfirmation: { finalProtestsResolved: true, resultProcessConfirmed: true },
    });
    expect(screen.getByLabelText(protestsLabel)).not.toBeChecked();
    expect(screen.getByLabelText(resultsLabel)).not.toBeChecked();
  });
});

describe('FinalOperationPanel phase start requirements', () => {
  const openMatch = scriptStep({
    id: 'start-match',
    text: 'START',
    effect: { type: 'OPEN_FIRING', purpose: 'MATCH', participantSelection: 'ALL_ACTIVE', durationSeconds: 250 },
  });

  it('stops without a command when the official cancels the requirement confirmation', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(openMatch))));
    renderPanel({ competitionTypeId: 'AR60_FINAL', phase: 'SIGHTING_COMPLETE' });
    await screen.findByText('START');

    click('Confirm and execute');
    await waitFor(() => expect(useConfirmDialogStore.getState().isOpen).toBe(true));
    expect(screen.getByRole('button', { name: 'Confirm and execute' })).toBeDisabled();
    const message = await answerConfirm(false);

    expect(message).toMatch(
      /^Before starting MATCH firing, confirm all operational requirements:\n- .+ Rule guidance: approximately 1 min\.$/,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and execute' })).toBeEnabled());
    expect(confirmStep).not.toHaveBeenCalled();
    expect(screen.queryByText(/Before starting/)).not.toBeInTheDocument();
  });

  it('sends the acknowledged requirements with the execution', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(openMatch))));
    confirmStep.mockResolvedValue(ok(finalRun(awaitingExecution(openMatch, { eligibleLaneIds: [] }))));
    executeFinalScriptStep.mockResolvedValue(executed());
    recordExecution.mockResolvedValue(ok(nextRun()));
    renderPanel({ competitionTypeId: 'AR60_FINAL', phase: 'SIGHTING_COMPLETE' });
    await screen.findByText('START');

    click('Confirm and execute');
    await answerConfirm(true);

    await waitFor(() => expect(recordExecution).toHaveBeenCalled());
    expect(executeFinalScriptStep).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgedRequirementIds: [RULE_PACK_TARGET_RESET_REQUIREMENT_ID] }),
    );
  });

  it('asks nothing when the phase does not start with this step', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(openMatch))));
    confirmStep.mockResolvedValue(fail('The step was already confirmed'));
    renderPanel({ competitionTypeId: 'AR60_FINAL', phase: 'MATCH' });
    await screen.findByText('START');

    click('Confirm and execute');

    await screen.findByText('The step was already confirmed');
    expect(useConfirmDialogStore.getState().isOpen).toBe(false);
  });
});

describe('FinalOperationPanel official-selected Lanes', () => {
  const timed = (id: string, requiredParticipantCount: number) =>
    scriptStep({
      id,
      text: `Timed series ${id}`,
      effect: {
        type: 'RUN_TIMED_TARGET',
        purpose: 'MATCH',
        participantSelection: 'OFFICIAL_SELECTED',
        programId: 'rapid-fire',
        shotsPerParticipant: 5,
        requiredParticipantCount,
      },
    });
  const lanes = [
    laneSnapshot(LANE_A, 1, { name: 'Athlete A', startNumber: 3 }),
    laneSnapshot(LANE_B, 2),
    laneSnapshot(LANE_C, 3, { name: 'Athlete C', startNumber: 1 }, { finished: true }),
    laneSnapshot(LANE_D, null, { name: 'Athlete D', startNumber: 7 }, { alias: 'West 4' }),
  ];

  /**
   * A step change clears the selection in an effect after the step renders. The reset leaves nothing to wait for
   * on screen, so flush the pending effects and their state updates before selecting.
   */
  const settle = () => act(async () => {});

  it('confirms exactly the required number of active Lanes', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(timed('series-1', 2)))));
    confirmStep.mockResolvedValue(fail('The step was already confirmed'));
    renderPanel({ lanes });
    await screen.findByText('Select exactly 2 firing Lanes');
    await settle();

    expect(screen.queryByLabelText(/Athlete C/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('FP 2 · Start number missing')).not.toBeChecked();
    const confirm = screen.getByRole('button', { name: 'Confirm and execute' });
    fireEvent.click(screen.getByLabelText('FP 1 · Athlete A · Start 3'));
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText('FP 2 · Start number missing'));
    expect(confirm).toBeEnabled();
    fireEvent.click(screen.getByLabelText('West 4 · Athlete D · Start 7'));
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText('FP 2 · Start number missing'));
    click('Confirm and execute');

    await screen.findByText('The step was already confirmed');
    expect(confirmStep).toHaveBeenCalledWith({
      runId: RUN_ID,
      stepId: 'series-1',
      eligibleLaneIds: [LANE_A, LANE_D],
      officialName: 'Jury Chair',
    });
  });

  it('keeps the selection for the same step and clears it for a new step', async () => {
    getByCompetition
      .mockResolvedValueOnce(ok(finalRun(stepProjection(timed('series-1', 1)))))
      .mockResolvedValueOnce(ok(finalRun(stepProjection(timed('series-1', 1)))))
      .mockResolvedValueOnce(ok(finalRun(stepProjection(timed('series-2', 1)))));
    renderPanel({ lanes });
    await screen.findByText('Select exactly 1 firing Lane');
    await settle();
    fireEvent.click(screen.getByLabelText('FP 1 · Athlete A · Start 3'));

    click('Refresh');
    await waitFor(() => expect(getByCompetition).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
    await settle();
    expect(screen.getByLabelText('FP 1 · Athlete A · Start 3')).toBeChecked();

    click('Refresh');
    await screen.findByText('Timed series series-2');
    await waitFor(() => expect(screen.getByLabelText('FP 1 · Athlete A · Start 3')).not.toBeChecked());
  });

  it('does not ask for Lanes once the step awaits execution', async () => {
    getByCompetition.mockResolvedValue(ok(finalRun(awaitingExecution(timed('series-1', 2)))));
    renderPanel({ lanes });
    await screen.findByText('Timed series series-1');

    expect(screen.queryByText(/Select exactly/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry execution' })).toBeEnabled();
  });
});

describe('FinalOperationPanel skip', () => {
  it('skips a check with the note as its reason', async () => {
    getByCompetition.mockResolvedValue(
      ok(finalRun(stepProjection(scriptStep({ id: 'check', kind: 'CHECK', text: 'Check the targets' })))),
    );
    skipStep.mockResolvedValue(ok(nextRun()));
    renderPanel();
    await screen.findByText('Check the targets');
    expect(screen.getByRole('button', { name: 'Skip with reason' })).toBeDisabled();
    type('Confirmation / exception note', '  Checked before the Final  ');
    type('Official name', ' Chief RO ');

    click('Skip with reason');

    expect(await screen.findByText('START')).toBeInTheDocument();
    expect(skipStep).toHaveBeenCalledWith({
      runId: RUN_ID,
      stepId: 'check',
      reason: 'Checked before the Final',
      officialName: 'Chief RO',
    });
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('');
  });

  it('shows a failed skip', async () => {
    getByCompetition.mockResolvedValue(
      ok(finalRun(stepProjection(scriptStep({ kind: 'ANNOUNCEMENT', text: 'Introduce the finalists' })))),
    );
    skipStep.mockResolvedValue(fail('The step cannot be skipped'));
    renderPanel();
    await screen.findByText('Introduce the finalists');
    type('Confirmation / exception note', 'Not needed');

    click('Skip with reason');

    expect(await screen.findByText('The step cannot be skipped')).toHaveAttribute('class', ERROR_BANNER_CLASS);
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('Not needed');
  });

  it.each([
    { kind: 'COMMAND' as const, effect: { type: 'NONE' as const } },
    { kind: 'CHECK' as const, effect: { type: 'CHECKPOINT' as const } },
  ])('offers no skip for a $kind step with a $effect.type effect', async ({ kind, effect }) => {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(scriptStep({ kind, effect, text: 'Step' })))));
    renderPanel();
    await screen.findByText('Step');

    expect(screen.queryByRole('button', { name: 'Skip with reason' })).not.toBeInTheDocument();
  });
});

describe('FinalOperationPanel abort', () => {
  async function renderActiveRun() {
    getByCompetition.mockResolvedValue(ok(finalRun(stepProjection(loadStep))));
    renderPanel();
    await screen.findByText('LOAD');
    expect(screen.getByRole('button', { name: 'Abort run' })).toBeDisabled();
    type('Confirmation / exception note', '  Range unsafe  ');
  }

  it('does nothing when the official cancels', async () => {
    await renderActiveRun();

    click('Abort run');

    expect(await answerConfirm(false)).toBe(ABORT_CONFIRMATION);
    expect(abort).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('  Range unsafe  ');
  });

  it('aborts the run and clears the retained Lane cue', async () => {
    abort.mockResolvedValue(ok(finalRun(null, { status: 'ABORTED' })));
    clearFinalCue.mockResolvedValue({ success: true });
    await renderActiveRun();

    click('Abort run');
    await answerConfirm(true);

    expect(await screen.findByText('ABORTED')).toBeInTheDocument();
    await waitFor(() => expect(clearFinalCue).toHaveBeenCalledWith({ competitionId: COMPETITION_ID }));
    expect(abort).toHaveBeenCalledWith({ runId: RUN_ID, reason: 'Range unsafe', officialName: 'Jury Chair' });
    expect(screen.queryByText(/could not be cleared/)).not.toBeInTheDocument();
  });

  it.each([
    {
      response: { success: false, error: { code: 'MQTT', message: 'Broker offline' } },
      text: 'Final run was aborted, but the retained Lane cue could not be cleared: Broker offline',
    },
    {
      response: { success: false },
      text: 'Final run was aborted, but the retained Lane cue could not be cleared: unknown error',
    },
  ])('reports an abort whose cue could not be cleared: $text', async ({ response, text }) => {
    abort.mockResolvedValue(ok(finalRun(null, { status: 'ABORTED' })));
    clearFinalCue.mockResolvedValue(response);
    await renderActiveRun();

    click('Abort run');
    await answerConfirm(true);

    expect(await screen.findByText(text)).toHaveAttribute('class', ERROR_BANNER_CLASS);
    expect(screen.getByText('ABORTED')).toBeInTheDocument();
  });

  it('shows a failed abort without clearing the cue', async () => {
    abort.mockResolvedValue(fail('The run is already closed'));
    await renderActiveRun();

    click('Abort run');
    await answerConfirm(true);

    expect(await screen.findByText('The run is already closed')).toBeInTheDocument();
    expect(clearFinalCue).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Confirmation / exception note')).toHaveValue('  Range unsafe  ');
  });
});

describe('FinalOperationPanel aborted run cleanup', () => {
  beforeEach(() => {
    getByCompetition.mockResolvedValue(ok(finalRun(null, { status: 'ABORTED' })));
  });

  it('explains the cleanup and the read-only audit', async () => {
    clearFinalCue.mockResolvedValue({ success: true });
    renderPanel();

    expect(
      await screen.findByText(
        'Abort is already recorded. Retrying this cleanup only removes the presentation cue retained for Lane; it does not issue STOP or change the command history.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This run is aborted. Its command and execution audit remains read-only.'),
    ).toBeInTheDocument();
    click('Clear retained Lane cue');
    await waitFor(() => expect(clearFinalCue).toHaveBeenCalledWith({ competitionId: COMPETITION_ID }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clear retained Lane cue' })).toBeEnabled());
    expect(screen.queryByText(/cue/i, { selector: 'div.border-l-2' })).not.toBeInTheDocument();
  });

  it.each([
    { response: { success: false, error: { code: 'MQTT', message: 'Broker offline' } }, text: 'Broker offline' },
    { response: { success: false }, text: 'Failed to clear the retained Lane cue' },
  ])('shows a failed cue cleanup: $text', async ({ response, text }) => {
    clearFinalCue.mockResolvedValue(response);
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Clear retained Lane cue' }));

    expect(await screen.findByText(text)).toHaveAttribute('class', ERROR_BANNER_CLASS);
  });
});
