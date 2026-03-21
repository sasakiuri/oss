// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  AdvanceSeriesCmdSchema,
  AssignAthleteCmdSchema,
  CommandAckPayloadSchema,
  EndSightingCmdSchema,
  FinishCompetitionCmdSchema,
  JoinCompetitionCmdSchema,
  LeaveCompetitionCmdSchema,
  ResetSessionCmdSchema,
  StartMatchCmdSchema,
  StartSightingCmdSchema,
  TimerExpiredCmdSchema,
  TimerStartedCmdSchema,
} from '@/main/modules/mqtt/domain/MqttCommandSchemas';

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
      const result = JoinCompetitionCmdSchema.safeParse({
        ...validBase(),
        commandId: 'not-a-uuid',
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-datetime issuedAt', () => {
      const result = JoinCompetitionCmdSchema.safeParse({
        ...validBase(),
        issuedAt: 'yesterday',
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing issuedBy', () => {
      const { issuedBy: _, ...base } = validBase();
      const result = JoinCompetitionCmdSchema.safeParse({
        ...base,
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // Tier 1 Lane Commands
  // ============================================================

  describe('JoinCompetitionCmdSchema', () => {
    it('accepts valid data', () => {
      const result = JoinCompetitionCmdSchema.safeParse({
        ...validBase(),
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-UUID competitionId', () => {
      const result = JoinCompetitionCmdSchema.safeParse({
        ...validBase(),
        competitionId: 'abc',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing competitionId', () => {
      const result = JoinCompetitionCmdSchema.safeParse(validBase());
      expect(result.success).toBe(false);
    });
  });

  describe('LeaveCompetitionCmdSchema', () => {
    it('accepts valid data', () => {
      const result = LeaveCompetitionCmdSchema.safeParse({
        ...validBase(),
        competitionId: crypto.randomUUID(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing competitionId', () => {
      const result = LeaveCompetitionCmdSchema.safeParse(validBase());
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // Broadcast Commands
  // ============================================================

  describe('StartSightingCmdSchema', () => {
    it('accepts valid data without targetLaneIds', () => {
      const result = StartSightingCmdSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid data with targetLaneIds', () => {
      const result = StartSightingCmdSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 900,
        targetLaneIds: [crypto.randomUUID(), crypto.randomUUID()],
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-positive timerDurationSeconds', () => {
      const result = StartSightingCmdSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer timerDurationSeconds', () => {
      const result = StartSightingCmdSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 10.5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('EndSightingCmdSchema', () => {
    it('accepts valid base data', () => {
      const result = EndSightingCmdSchema.safeParse(validBase());
      expect(result.success).toBe(true);
    });
  });

  describe('StartMatchCmdSchema', () => {
    it('accepts valid data', () => {
      const result = StartMatchCmdSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
        timerDurationSeconds: 3600,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing timerDurationSeconds', () => {
      const result = StartMatchCmdSchema.safeParse({
        ...validBase(),
        timerStartAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('TimerStartedCmdSchema', () => {
    it('accepts valid data with nullable seriesIndex', () => {
      const result = TimerStartedCmdSchema.safeParse({
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
      const result = TimerStartedCmdSchema.safeParse({
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
      const result = TimerStartedCmdSchema.safeParse({
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
      const result = TimerStartedCmdSchema.safeParse({
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

  describe('TimerExpiredCmdSchema', () => {
    it('accepts valid data', () => {
      const result = TimerExpiredCmdSchema.safeParse({
        ...validBase(),
        timerScope: 'SERIES',
        stageIndex: 1,
        seriesIndex: 2,
        expiredAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing expiredAt', () => {
      const result = TimerExpiredCmdSchema.safeParse({
        ...validBase(),
        timerScope: 'SERIES',
        stageIndex: 1,
        seriesIndex: 2,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('AdvanceSeriesCmdSchema', () => {
    it('accepts valid data without optional timerStartAt', () => {
      const result = AdvanceSeriesCmdSchema.safeParse({
        ...validBase(),
        stageIndex: 0,
        fromSeriesIndex: 1,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid data with timerStartAt', () => {
      const result = AdvanceSeriesCmdSchema.safeParse({
        ...validBase(),
        stageIndex: 0,
        fromSeriesIndex: 1,
        timerStartAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative fromSeriesIndex', () => {
      const result = AdvanceSeriesCmdSchema.safeParse({
        ...validBase(),
        stageIndex: 0,
        fromSeriesIndex: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FinishCompetitionCmdSchema', () => {
    it('accepts valid base data', () => {
      const result = FinishCompetitionCmdSchema.safeParse(validBase());
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // Per-Lane Commands
  // ============================================================

  describe('AssignAthleteCmdSchema', () => {
    it('accepts valid athlete data', () => {
      const result = AssignAthleteCmdSchema.safeParse({
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
      const result = AssignAthleteCmdSchema.safeParse({
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
      const result = AssignAthleteCmdSchema.safeParse({
        ...validBase(),
        athlete: null,
      });
      expect(result.success).toBe(true);
    });

    it('rejects non-positive startNumber', () => {
      const result = AssignAthleteCmdSchema.safeParse({
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
      const result = AssignAthleteCmdSchema.safeParse(validBase());
      expect(result.success).toBe(false);
    });
  });

  describe('ResetSessionCmdSchema', () => {
    it('accepts valid data without reason', () => {
      const result = ResetSessionCmdSchema.safeParse(validBase());
      expect(result.success).toBe(true);
    });

    it('accepts valid data with reason', () => {
      const result = ResetSessionCmdSchema.safeParse({
        ...validBase(),
        reason: 'equipment malfunction',
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // ACK
  // ============================================================

  describe('CommandAckPayloadSchema', () => {
    it('accepts valid ACK without error/warning', () => {
      const result = CommandAckPayloadSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid ACK with error', () => {
      const result = CommandAckPayloadSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'error',
        error: { code: 'CMD_FAILED', message: 'Something went wrong' },
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid ACK with warning', () => {
      const result = CommandAckPayloadSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'executing',
        warning: 'Timer drift detected',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const result = CommandAckPayloadSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: crypto.randomUUID(),
        status: 'pending',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID laneId', () => {
      const result = CommandAckPayloadSchema.safeParse({
        commandId: crypto.randomUUID(),
        laneId: 'lane-1',
        status: 'done',
        acknowledgedAt: new Date().toISOString(),
      });
      expect(result.success).toBe(false);
    });
  });
});
