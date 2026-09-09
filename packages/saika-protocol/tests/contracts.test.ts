// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  CompetitionCuePayloadSchema,
  CompetitionDefinitionBindingSchema,
  CompetitionStatePayloadSchema,
  QualificationRecoveryFiringAuthorizationSchema,
  ReserveLaneTransferActionSchema,
  ShotTimingSettingsSchema,
  StartMatchCommandSchema,
  createCommandSchemas,
} from '../src';

const id = '11111111-1111-4111-8111-111111111111';
const at = '2026-09-09T00:00:00.000Z';

describe('MQTT wire compatibility', () => {
  it('preserves the timed-target cue published by Director', () => {
    const cue = {
      schemaVersion: 1,
      competitionId: id,
      runId: id,
      cueId: id,
      confirmationEntryId: id,
      branch: 'MAIN',
      iteration: 0,
      stepId: 'final.fire',
      actor: 'CRO',
      kind: 'COMMAND',
      text: 'START',
      ruleReference: '6.17.2',
      effect: { type: 'RUN_TIMED_TARGET', purpose: 'MATCH' },
      publishedAt: at,
    };
    expect(CompetitionCuePayloadSchema.parse(JSON.parse(JSON.stringify(cue)))).toEqual(cue);
  });

  it('retains mixed-team metadata and still accepts state without that optional field', () => {
    const state = {
      competitionId: id,
      competitionTypeId: 'AR60',
      competitionTypeName: 'Air Rifle',
      discipline: 'AR',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      phase: 'NOT_STARTED',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      laneIds: [id],
      startedAt: null,
      finishedAt: null,
      publishedAt: at,
    };
    expect(CompetitionStatePayloadSchema.parse(state)).toEqual(state);
    expect(CompetitionStatePayloadSchema.parse({ ...state, competitionUnit: 'MIXED_TEAM' })).toEqual({
      ...state,
      competitionUnit: 'MIXED_TEAM',
    });
  });

  it('keeps Lane legacy issuer acceptance separate from Director outbound validation', () => {
    const command = { commandId: id, issuedBy: '', issuedAt: at, timerStartAt: at };
    const laneCommands = createCommandSchemas(z.string());
    expect(laneCommands.StartMatchCommandSchema.parse(command)).toEqual(command);
    expect(StartMatchCommandSchema.safeParse(command).success).toBe(false);
    expect(StartMatchCommandSchema.parse({ ...command, issuedBy: 'CRO' })).toEqual({ ...command, issuedBy: 'CRO' });
    expect(laneCommands.StartMatchCommandSchema.safeParse({ ...command, commandId: 'invalid' }).success).toBe(false);
  });

  it('requires an exact Rule Pack identity only in required mode', () => {
    expect(
      CompetitionDefinitionBindingSchema.safeParse({ protocolVersion: 1, compatibilityMode: 'REQUIRED' }).success,
    ).toBe(false);
    expect(
      CompetitionDefinitionBindingSchema.safeParse({ protocolVersion: 1, compatibilityMode: 'ADVISORY' }).success,
    ).toBe(true);
  });

  it('keeps cross-field recovery validation after extraction', () => {
    const authorization = (totalSeconds: number) => ({
      phase: 'SERIES_RECOVERY',
      seriesRecovery: {
        treatment: 'COMPLETE_REMAINING_SHOTS',
        shotsToFire: 2,
        execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 7, totalSeconds },
      },
    });
    expect(QualificationRecoveryFiringAuthorizationSchema.safeParse(authorization(14)).success).toBe(true);
    expect(QualificationRecoveryFiringAuthorizationSchema.safeParse(authorization(7)).success).toBe(false);
  });

  it('requires retirement evidence before activating a transferred Lane', () => {
    const action = { operation: 'ACTIVATE_TARGET', id, digest: 'a'.repeat(64) };
    expect(ReserveLaneTransferActionSchema.safeParse(action).success).toBe(false);
    expect(ReserveLaneTransferActionSchema.safeParse({ ...action, sourceRetired: false }).success).toBe(false);
    expect(ReserveLaneTransferActionSchema.safeParse({ ...action, sourceRetired: true }).success).toBe(true);
  });

  it('preserves unknown timing bounds as null instead of inventing defaults', () => {
    const settings = {
      mode: 'BOUNDED',
      maximumReceiptDelayMilliseconds: null,
      clockUncertaintyMilliseconds: null,
    };
    expect(ShotTimingSettingsSchema.parse(settings)).toEqual(settings);
    expect(ShotTimingSettingsSchema.safeParse({ ...settings, clockUncertaintyMilliseconds: -1 }).success).toBe(false);
  });
});
