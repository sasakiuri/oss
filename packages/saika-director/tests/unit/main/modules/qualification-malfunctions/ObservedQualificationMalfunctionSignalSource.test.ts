import { describe, expect, it } from 'vitest';

import { ObservedQualificationMalfunctionSignalSource } from '@/main/modules/qualification-malfunctions';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

const competitionId = '11111111-1111-4111-8111-111111111111';
const participantId = '22222222-2222-4222-8222-222222222222';
const laneId = '33333333-3333-4333-8333-333333333333';
const signalId = '44444444-4444-4444-8444-444444444444';
const sessionId = '55555555-5555-4555-8555-555555555555';

describe('ObservedQualificationMalfunctionSignalSource', () => {
  it('retains an immutable declaration after its Lane clears the active signal', () => {
    const source = new ObservedQualificationMalfunctionSignalSource();
    source.observe(controlSnapshot('ACTIVE'));
    source.observe(controlSnapshot('CLEARED'));

    expect(source.findById(signalId)).toMatchObject({
      signalId,
      status: 'CLEARED',
      competitionId,
      participantId,
      stageIndex: 1,
      seriesIndex: 2,
      recordedShots: 3,
      signalledAt: new Date('2026-09-04T01:00:00.000Z'),
    });
  });

  it('rejects reuse of a signal identity with changed context', () => {
    const source = new ObservedQualificationMalfunctionSignalSource();
    source.observe(controlSnapshot('ACTIVE'));
    const changed = controlSnapshot('ACTIVE');
    changed.lanes[0]!.qualificationMalfunctionSignal!.context!.recordedShots = 4;

    expect(() => source.observe(changed)).toThrow('changed its immutable context');
    expect(source.findById(signalId)?.recordedShots).toBe(3);
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
        qualificationMalfunctionSignal: {
          schemaVersion: 1,
          laneId,
          status,
          signalId,
          context: {
            competitionId,
            sessionId,
            participantId,
            participantName: 'Athlete A',
            startNumber: '101',
            phase: 'MATCH',
            stageIndex: 1,
            seriesIndex: 2,
            seriesShotLimit: 5,
            recordedShots: 3,
            timedTargetProgramId: 'RFPM_PROGRAM',
            exposureIndex: null,
          },
          message: 'Possible firearm malfunction.',
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
