import { describe, expect, it } from 'vitest';

import { ObservedEstComplaintSignalSource } from '@/main/modules/est-complaints';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

const competitionId = '11111111-1111-4111-8111-111111111111';
const laneId = '22222222-2222-4222-8222-222222222222';
const signalId = '33333333-3333-4333-8333-333333333333';
const sessionId = '44444444-4444-4444-8444-444444444444';

describe('ObservedEstComplaintSignalSource', () => {
  it('retains an immutable complaint after its Lane clears the active signal', () => {
    const source = new ObservedEstComplaintSignalSource();
    source.observe(controlSnapshot('ACTIVE'));
    source.observe(controlSnapshot('CLEARED'));

    expect(source.findById(signalId)).toMatchObject({
      signalId,
      laneId,
      firingPointNumber: 7,
      status: 'CLEARED',
      issue: 'SHOT_VALUE',
      context: { competitionId, recordedShots: 3 },
      signalledAt: new Date('2026-09-04T01:00:00.000Z'),
    });
    expect(source.listByCompetition(competitionId)).toHaveLength(1);
  });

  it('rejects reuse of a signal identity with changed evidence', () => {
    const source = new ObservedEstComplaintSignalSource();
    source.observe(controlSnapshot('ACTIVE'));
    const changed = controlSnapshot('ACTIVE');
    changed.lanes[0]!.estComplaintSignal!.context!.recordedShots = 4;

    expect(() => source.observe(changed)).toThrow('changed its immutable context');
    expect(source.findById(signalId)?.context.recordedShots).toBe(3);
  });
});

function controlSnapshot(status: 'ACTIVE' | 'CLEARED'): MqttControlSnapshotDto {
  return {
    connected: true,
    brokerUrl: 'mqtt://localhost:1883',
    activeCompetitionId: competitionId,
    lanes: [
      {
        laneId,
        laneAlias: 'Lane 7',
        firingPointNumber: 7,
        hardware: null,
        safetyState: null,
        rangeOfficerRequest: null,
        qualificationMalfunctionSignal: null,
        estComplaintSignal: {
          schemaVersion: 1,
          laneId,
          status,
          signalId,
          issue: 'SHOT_VALUE',
          context: {
            competitionId,
            sessionId,
            participantId: 'athlete-a',
            participantName: 'Athlete A',
            startNumber: '101',
            phase: 'MATCH',
            stageIndex: 1,
            seriesIndex: 2,
            seriesShotLimit: 5,
            recordedShots: 3,
            timedTargetProgramId: 'RFPM_PROGRAM',
            exposureIndex: 2,
            lastShot: {
              shotId: '55555555-5555-4555-8555-555555555555',
              shotNumberInSeries: 3,
              firedAt: '2026-09-04T00:58:59.000Z',
              receivedAt: '2026-09-04T00:59:00.000Z',
            },
          },
          message: 'Displayed value appears incorrect.',
          signalledAt: '2026-09-04T01:00:00.000Z',
          clearedAt: status === 'CLEARED' ? '2026-09-04T01:01:00.000Z' : null,
          clearedBy: status === 'CLEARED' ? 'RO A' : null,
          publishedAt: status === 'CLEARED' ? '2026-09-04T01:01:00.000Z' : '2026-09-04T01:00:00.000Z',
        },
        timedTargetState: null,
        qualificationRecoveryState: null,
        competitionState: null,
        assignment: null,
        score: null,
        lastRawShot: null,
        lastCompetitionShot: null,
        lastQualificationRecoveryShot: null,
        lastSeenAt: '2026-09-04T01:01:00.000Z',
      },
    ],
    competitions: [],
    lastCommand: null,
  };
}
