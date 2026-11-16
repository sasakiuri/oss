// SPDX-License-Identifier: MIT
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import {
  MQTT_COMMAND_ACTIONS,
  commandSchemasForScope,
  createCommandSchemas,
  type MqttCommandAction,
  type MqttCommandActionOf,
  type MqttCommandScope,
} from '../src/commands';

// Released wire contract: the actions each scope accepts in Lane and Director 0.4.x.
const laneActions = [
  'join-competition',
  'leave-competition',
  'probe-clock',
  'activate-safety-stop',
  'clear-safety-stop',
] as const;
const competitionActions = [
  'start-sighting',
  'end-sighting',
  'start-match',
  'advance-series',
  'finish-competition',
  'timer-started',
  'timer-expired',
  'start-shoot-off',
  'stop-shoot-off',
  'start-timed-target',
  'cancel-timed-target',
  'record-timed-target-unload',
] as const;
const competitionLaneActions = [
  'reserve-lane-transfer',
  'start-malfunction-firing',
  'read-malfunction-firing',
  'cancel-malfunction-firing',
  'assign-athlete',
  'reset-session',
  'pause-timer',
  'resume-timer',
  'resume-match',
  'start-qualification-recovery',
  'cancel-qualification-recovery',
  'apply-qualification-recovery',
  'settle-qualification-recovery',
  'retire-finalist',
] as const;

const schemas = createCommandSchemas();
const expectedSchemas: Record<MqttCommandScope, Record<string, z.ZodType>> = {
  lane: {
    'join-competition': schemas.JoinCompetitionCommandSchema,
    'leave-competition': schemas.LeaveCompetitionCommandSchema,
    'probe-clock': schemas.ProbeClockCommandSchema,
    'activate-safety-stop': schemas.ActivateSafetyStopCommandSchema,
    'clear-safety-stop': schemas.ClearSafetyStopCommandSchema,
  },
  competition: {
    'start-sighting': schemas.StartSightingCommandSchema,
    'end-sighting': schemas.EndSightingCommandSchema,
    'start-match': schemas.StartMatchCommandSchema,
    'advance-series': schemas.AdvanceSeriesCommandSchema,
    'finish-competition': schemas.FinishCompetitionCommandSchema,
    'timer-started': schemas.TimerStartedCommandSchema,
    'timer-expired': schemas.TimerExpiredCommandSchema,
    'start-shoot-off': schemas.StartShootOffCommandSchema,
    'stop-shoot-off': schemas.StopShootOffCommandSchema,
    'start-timed-target': schemas.StartTimedTargetCommandSchema,
    'cancel-timed-target': schemas.CancelTimedTargetCommandSchema,
    'record-timed-target-unload': schemas.RecordTimedTargetUnloadCommandSchema,
  },
  'competition-lane': {
    'reserve-lane-transfer': schemas.ReserveLaneTransferCommandSchema,
    'start-malfunction-firing': schemas.StartMalfunctionFiringCommandSchema,
    'read-malfunction-firing': schemas.ReadMalfunctionFiringCommandSchema,
    'cancel-malfunction-firing': schemas.CancelMalfunctionFiringCommandSchema,
    'assign-athlete': schemas.AssignAthleteCommandSchema,
    'reset-session': schemas.ResetSessionCommandSchema,
    'pause-timer': schemas.PauseTimerCommandSchema,
    'resume-timer': schemas.ResumeTimerCommandSchema,
    'resume-match': schemas.ResumeMatchCommandSchema,
    'start-qualification-recovery': schemas.StartQualificationRecoveryCommandSchema,
    'cancel-qualification-recovery': schemas.CancelQualificationRecoveryCommandSchema,
    'apply-qualification-recovery': schemas.ApplyQualificationRecoveryCommandSchema,
    'settle-qualification-recovery': schemas.SettleQualificationRecoveryCommandSchema,
    'retire-finalist': schemas.RetireFinalistCommandSchema,
  },
};

describe('MQTT command actions', () => {
  it('keeps every released action string in its scope', () => {
    expect(Object.keys(MQTT_COMMAND_ACTIONS)).toEqual([
      ...laneActions,
      ...competitionActions,
      ...competitionLaneActions,
    ]);
    expectTypeOf<MqttCommandActionOf<'lane'>>().toEqualTypeOf<(typeof laneActions)[number]>();
    expectTypeOf<MqttCommandActionOf<'competition'>>().toEqualTypeOf<(typeof competitionActions)[number]>();
    expectTypeOf<MqttCommandActionOf<'competition-lane'>>().toEqualTypeOf<(typeof competitionLaneActions)[number]>();
    expectTypeOf<MqttCommandAction>().toEqualTypeOf<
      (typeof laneActions)[number] | (typeof competitionActions)[number] | (typeof competitionLaneActions)[number]
    >();
  });

  it.each(['lane', 'competition', 'competition-lane'] as const)(
    'selects the same schema instances for the %s scope',
    (scope) => {
      const selected: Record<string, unknown> = commandSchemasForScope(schemas, scope);
      const expected = expectedSchemas[scope];
      expect(Object.keys(selected)).toEqual(Object.keys(expected));
      for (const [action, schema] of Object.entries(expected)) expect(selected[action]).toBe(schema);
    },
  );

  it('selects from the schema set it is given, so Lane keeps legacy empty issuer labels', () => {
    const command = {
      commandId: '11111111-1111-4111-8111-111111111111',
      issuedBy: '',
      issuedAt: '2026-09-09T00:00:00.000Z',
      competitionId: '22222222-2222-4222-8222-222222222222',
    };
    const legacy = commandSchemasForScope(createCommandSchemas(z.string()), 'lane');
    expect(legacy['join-competition'].safeParse(command).success).toBe(true);
    expect(commandSchemasForScope(schemas, 'lane')['join-competition'].safeParse(command).success).toBe(false);
  });

  it('keeps end-sighting and finish-competition on the bare command envelope', () => {
    expect(schemas.EndSightingCommandSchema).toBe(schemas.CommandBaseSchema);
    expect(schemas.FinishCompetitionCommandSchema).toBe(schemas.CommandBaseSchema);
  });
});

describe('cross-field command validation', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const at = '2026-09-09T00:00:00.000Z';
  const base = { commandId: id, issuedBy: 'Director', issuedAt: at };
  const issueAt = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
    result.error?.issues.map((issue) => [issue.path.join('.'), issue.message]);

  it('rejects a qualification recovery that expects more recorded shots than the series holds', () => {
    const command = {
      ...base,
      runId: id,
      decisionId: id,
      interruptionId: id,
      stageIndex: 0,
      seriesIndex: 1,
      expectedMatchProgramId: 'AR60',
      expectedSeriesShotLimit: 10,
      expectedRecordedShots: 8,
      authorization: {
        phase: 'SERIES_RECOVERY',
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 2,
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 7, totalSeconds: 14 },
        },
      },
      loadAt: at,
      officialName: 'Chief Range Officer',
      decisionRuleReference: '6.13.3',
      decidedAt: at,
    };
    expect(schemas.StartQualificationRecoveryCommandSchema.safeParse(command).success).toBe(true);
    expect(
      issueAt(schemas.StartQualificationRecoveryCommandSchema.safeParse({ ...command, expectedRecordedShots: 11 })),
    ).toEqual([['expectedRecordedShots', 'expectedRecordedShots must not exceed expectedSeriesShotLimit']]);
  });

  it('settles a kept series only when every series shot is recorded', () => {
    const command = {
      ...base,
      decisionId: id,
      interruptionId: id,
      stageIndex: 0,
      seriesIndex: 1,
      expectedMatchProgramId: 'AR60',
      expectedSeriesShotLimit: 10,
      expectedRecordedShots: 10,
      treatment: 'KEEP_RECORDED_SERIES',
      decisionOfficialName: 'Jury',
      decisionRuleReference: '6.13.3',
      decidedAt: at,
      appliedBy: 'Chief Range Officer',
      statement: 'Series kept as recorded.',
      appliedAt: at,
    };
    expect(schemas.SettleQualificationRecoveryCommandSchema.safeParse(command).success).toBe(true);
    expect(
      issueAt(schemas.SettleQualificationRecoveryCommandSchema.safeParse({ ...command, expectedRecordedShots: 9 })),
    ).toEqual([['expectedRecordedShots', 'KEEP_RECORDED_SERIES requires every series shot to be recorded']]);
  });

  it('requires a shoot-off to use exactly one of a generic duration or a timed-target program', () => {
    const command = {
      ...base,
      runId: id,
      iteration: 1,
      timerStartAt: at,
      shotsPerLane: 1,
      targetLaneIds: [id, '22222222-2222-4222-8222-222222222222'],
    };
    const timedTarget = { programId: 'rapid-fire', participantExecution: 'SIMULTANEOUS' };
    const message = 'A shoot-off requires exactly one generic duration or timed-target program';
    expect(schemas.StartShootOffCommandSchema.safeParse({ ...command, timerDurationSeconds: 75 }).success).toBe(true);
    expect(schemas.StartShootOffCommandSchema.safeParse({ ...command, timedTarget }).success).toBe(true);
    expect(issueAt(schemas.StartShootOffCommandSchema.safeParse(command))).toEqual([['timerDurationSeconds', message]]);
    expect(
      issueAt(schemas.StartShootOffCommandSchema.safeParse({ ...command, timerDurationSeconds: 75, timedTarget })),
    ).toEqual([['timerDurationSeconds', message]]);
  });
});
