// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';

import { CommandAcknowledgementSchema } from '@sasakiuri/saika-protocol/Acknowledgement';
import { describe, expect, it } from 'vitest';

import { laneCommandSchemas } from '@/main/modules/mqtt/domain/MqttCommandSchemas';

const {
  AdvanceSeriesCommandSchema,
  ApplyQualificationRecoveryCommandSchema,
  AssignAthleteCommandSchema,
  CancelQualificationRecoveryCommandSchema,
  EndSightingCommandSchema,
  FinishCompetitionCommandSchema,
  JoinCompetitionCommandSchema,
  LeaveCompetitionCommandSchema,
  PauseTimerCommandSchema,
  ResetSessionCommandSchema,
  ResumeMatchCommandSchema,
  ResumeTimerCommandSchema,
  StartMatchCommandSchema,
  StartQualificationRecoveryCommandSchema,
  StartSightingCommandSchema,
  StartShootOffCommandSchema,
  TimerExpiredCommandSchema,
  TimerStartedCommandSchema,
} = laneCommandSchemas;

const validBase = () => ({
  commandId: crypto.randomUUID(),
  issuedBy: 'director-1',
  issuedAt: new Date().toISOString(),
});

describe('MqttCommandSchemas', () => {
  // ============================================================
  // CommandBase field validation
  // ============================================================

  describe('CommandBase fields', () => {
    it('rejects non-UUID commandId', () => {
      const result = JoinCompetitionCommandSchema.safeParse({
        ...validBase(),
        commandId: 'not-a-uuid',
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-datetime issuedAt', () => {
      const result = JoinCompetitionCommandSchema.safeParse({
        ...validBase(),
        issuedAt: 'yesterday',
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing issuedBy', () => {
      const { issuedBy: _, ...base } = validBase();
      const result = JoinCompetitionCommandSchema.safeParse({
        ...base,
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // Tier 1 Lane Commands
  // ============================================================

  describe('JoinCompetitionCommandSchema', () => {
    it('accepts valid data', () => {
      const result = JoinCompetitionCommandSchema.safeParse({
        ...validBase(),
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-UUID competitionId', () => {
      const result = JoinCompetitionCommandSchema.safeParse({
        ...validBase(),
        competitionId: 'abc',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing competitionId', () => {
      const result = JoinCompetitionCommandSchema.safeParse(validBase());
      expect(result.success).toBe(false);
    });
  });

  describe('LeaveCompetitionCommandSchema', () => {
    it('accepts valid data', () => {
      const result = LeaveCompetitionCommandSchema.safeParse({
        ...validBase(),
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing competitionId', () => {
      const result = LeaveCompetitionCommandSchema.safeParse(validBase());
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // Broadcast Commands
  // ============================================================

  describe('StartSightingCommandSchema', () => {
    it('accepts valid data without targetLaneIds', () => {
      const result = StartSightingCommandSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid data with targetLaneIds', () => {
      const result = StartSightingCommandSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
        targetLaneIds: [crypto.randomUUID(), crypto.randomUUID()],
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-positive timerDurationSeconds', () => {
      const result = StartSightingCommandSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer timerDurationSeconds', () => {
      const result = StartSightingCommandSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 10.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('EndSightingCommandSchema', () => {
    it('accepts valid base data', () => {
      const result = EndSightingCommandSchema.safeParse(validBase());
      expect(result.success).toBe(true);
    });
  });

  describe('StartMatchCommandSchema', () => {
    it('accepts valid data', () => {
      const result = StartMatchCommandSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 3600,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a missing generic duration for independently timed-target matches', () => {
      const result = StartMatchCommandSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('StartShootOffCommandSchema', () => {
    const shootOff = () => ({
      ...validBase(),
      runId: crypto.randomUUID(),
      iteration: 1,
      timerStartAt: new Date().toISOString(),
      shotsPerLane: 5,
      targetLaneIds: [crypto.randomUUID(), crypto.randomUUID()],
    });

    it('accepts either a generic window or a RulePack timed-target program', () => {
      expect(StartShootOffCommandSchema.safeParse({ ...shootOff(), timerDurationSeconds: 60 }).success).toBe(true);
      expect(
        StartShootOffCommandSchema.safeParse({
          ...shootOff(),
          timedTarget: {
            programId: 'P25_FINAL_SHOOT_OFF_RAPID_3_7',
            participantExecution: 'SIMULTANEOUS',
          },
        }).success,
      ).toBe(true);
    });

    it('rejects an ambiguous or missing shoot-off timing source', () => {
      expect(StartShootOffCommandSchema.safeParse(shootOff()).success).toBe(false);
      expect(
        StartShootOffCommandSchema.safeParse({
          ...shootOff(),
          timerDurationSeconds: 60,
          timedTarget: { programId: 'RFPM_FINAL_SHOOT_OFF_4', participantExecution: 'SEQUENTIAL' },
        }).success,
      ).toBe(false);
    });
  });

  describe('TimerStartedCommandSchema', () => {
    it('accepts valid data with nullable seriesIndex', () => {
      const result = TimerStartedCommandSchema.safeParse({
        ...validBase(),
        timerScope: 'STAGE',
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 600,
        stageIndex: 0,
        seriesIndex: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid data with seriesIndex', () => {
      const result = TimerStartedCommandSchema.safeParse({
        ...validBase(),
        timerScope: 'SERIES',
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 120,
        stageIndex: 1,
        seriesIndex: 3,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid timerScope', () => {
      const result = TimerStartedCommandSchema.safeParse({
        ...validBase(),
        timerScope: 'INVALID',
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 600,
        stageIndex: 0,
        seriesIndex: null,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative stageIndex', () => {
      const result = TimerStartedCommandSchema.safeParse({
        ...validBase(),
        timerScope: 'STAGE',
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 600,
        stageIndex: -1,
        seriesIndex: null,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TimerExpiredCommandSchema', () => {
    it('accepts valid data', () => {
      const result = TimerExpiredCommandSchema.safeParse({
        ...validBase(),
        timerScope: 'SERIES',
        stageIndex: 1,
        seriesIndex: 2,
        expiredAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing expiredAt', () => {
      const result = TimerExpiredCommandSchema.safeParse({
        ...validBase(),
        timerScope: 'SERIES',
        stageIndex: 1,
        seriesIndex: 2,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AdvanceSeriesCommandSchema', () => {
    it('accepts valid data without optional timerStartAt', () => {
      const result = AdvanceSeriesCommandSchema.safeParse({
        ...validBase(),
        stageIndex: 0,
        fromSeriesIndex: 1,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid data with timerStartAt', () => {
      const result = AdvanceSeriesCommandSchema.safeParse({
        ...validBase(),
        stageIndex: 0,
        fromSeriesIndex: 1,
        resumeOnly: true,
        timerStartAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
      assert.ok(result.success);
      expect(result.data.resumeOnly).toBe(true);
    });

    it('rejects negative fromSeriesIndex', () => {
      const result = AdvanceSeriesCommandSchema.safeParse({
        ...validBase(),
        stageIndex: 0,
        fromSeriesIndex: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FinishCompetitionCommandSchema', () => {
    it('accepts valid base data', () => {
      const result = FinishCompetitionCommandSchema.safeParse(validBase());
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // Per-Lane Commands
  // ============================================================

  describe('AssignAthleteCommandSchema', () => {
    it('accepts valid athlete data', () => {
      const result = AssignAthleteCommandSchema.safeParse({
        ...validBase(),
        athlete: {
          startNumber: 1,
          id: 'athlete-001',
          name: 'Test Athlete',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts athlete with optional fields', () => {
      const result = AssignAthleteCommandSchema.safeParse({
        ...validBase(),
        athlete: {
          startNumber: 1,
          id: 'athlete-001',
          name: 'Test Athlete',
          teamName: 'Team A',
          issfCode: 'JPN',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts null athlete (unassign)', () => {
      const result = AssignAthleteCommandSchema.safeParse({
        ...validBase(),
        athlete: null,
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-positive startNumber', () => {
      const result = AssignAthleteCommandSchema.safeParse({
        ...validBase(),
        athlete: {
          startNumber: 0,
          id: 'athlete-001',
          name: 'Test Athlete',
        },
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing athlete field', () => {
      const result = AssignAthleteCommandSchema.safeParse(validBase());
      expect(result.success).toBe(false);
    });
  });

  describe('ResetSessionCommandSchema', () => {
    it('accepts valid data without reason', () => {
      const result = ResetSessionCommandSchema.safeParse(validBase());
      expect(result.success).toBe(true);
    });

    it('accepts valid data with reason', () => {
      const result = ResetSessionCommandSchema.safeParse({
        ...validBase(),
        reason: 'equipment malfunction',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Lane interruption command schemas', () => {
    const interruptionId = crypto.randomUUID();

    it('accepts pause, timed resume, and MATCH resume commands', () => {
      expect(
        PauseTimerCommandSchema.safeParse({
          ...validBase(),
          interruptionId,
          pausedAt: new Date().toISOString(),
        }).success,
      ).toBe(true);
      expect(
        ResumeTimerCommandSchema.safeParse({
          ...validBase(),
          interruptionId,
          timerStartAt: new Date().toISOString(),
          authorizedRemainingSeconds: 540,
          unlimitedSightingShots: true,
        }).success,
      ).toBe(true);
      expect(ResumeMatchCommandSchema.safeParse({ ...validBase(), interruptionId }).success).toBe(true);
    });

    it('rejects a resume without a positive authorized duration', () => {
      expect(
        ResumeTimerCommandSchema.safeParse({
          ...validBase(),
          interruptionId,
          timerStartAt: new Date().toISOString(),
          authorizedRemainingSeconds: 0,
          unlimitedSightingShots: false,
        }).success,
      ).toBe(false);
    });
  });

  describe('Qualification recovery command schemas', () => {
    const start = () => ({
      ...validBase(),
      runId: crypto.randomUUID(),
      decisionId: crypto.randomUUID(),
      interruptionId: crypto.randomUUID(),
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      expectedSeriesShotLimit: 5,
      expectedRecordedShots: 3,
      authorization: {
        phase: 'SERIES_RECOVERY',
        seriesRecovery: {
          treatment: 'COMPLETE_REMAINING_SHOTS',
          shotsToFire: 2,
          execution: { mode: 'SECONDS_PER_SHOT', secondsPerShot: 48, totalSeconds: 96 },
        },
      },
      loadAt: '2026-09-03T01:00:00.000Z',
      officialName: 'Jury Member',
      decisionRuleReference: '8.8.1(c-d)',
      decidedAt: '2026-09-03T00:59:00.000Z',
    });

    it('accepts a firing-only official recovery and its independent cancellation', () => {
      const command = start();
      expect(StartQualificationRecoveryCommandSchema.safeParse(command).success).toBe(true);
      expect(
        CancelQualificationRecoveryCommandSchema.safeParse({
          ...validBase(),
          runId: command.runId,
          reason: 'Jury cancelled this recovery window',
        }).success,
      ).toBe(true);
      expect(
        ApplyQualificationRecoveryCommandSchema.safeParse({
          ...validBase(),
          runId: command.runId,
          appliedBy: 'Range Officer B',
          statement: 'Recovery evidence checked.',
          appliedAt: '2026-09-03T01:03:00.000Z',
        }).success,
      ).toBe(true);
    });

    it('rejects KEEP_RECORDED_SERIES and zero-shot firing commands', () => {
      expect(
        StartQualificationRecoveryCommandSchema.safeParse({
          ...start(),
          authorization: {
            phase: 'SERIES_RECOVERY',
            seriesRecovery: { treatment: 'KEEP_RECORDED_SERIES', shotsToFire: 0, execution: null },
          },
        }).success,
      ).toBe(false);
      expect(
        StartQualificationRecoveryCommandSchema.safeParse({
          ...start(),
          authorization: { phase: 'EXTRA_SIGHTING', shotsToFire: 0 },
        }).success,
      ).toBe(false);
      expect(
        ApplyQualificationRecoveryCommandSchema.safeParse({
          ...validBase(),
          runId: crypto.randomUUID(),
          appliedBy: '',
          statement: '',
          appliedAt: '2026-09-03T01:03:00.000Z',
        }).success,
      ).toBe(false);
    });
  });

  // ============================================================
  // ACK
  // ============================================================

  describe('CommandAcknowledgementSchema', () => {
    it('accepts valid ACK without error/warning', () => {
      const result = CommandAcknowledgementSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid ACK with error', () => {
      const result = CommandAcknowledgementSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'error',
        error: { code: 'CMD_FAILED', message: 'Something went wrong' },
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid ACK with warning', () => {
      const result = CommandAcknowledgementSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'executing',
        warning: 'Timer drift detected',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts structured command result data', () => {
      const result = CommandAcknowledgementSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'done',
        data: { remainingSeconds: 240, status: 'PAUSED' },
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = CommandAcknowledgementSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'pending',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID laneId', () => {
      const result = CommandAcknowledgementSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: 'lane-1',
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });
});
