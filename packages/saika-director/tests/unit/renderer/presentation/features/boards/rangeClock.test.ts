// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { projectAuthoritativeRangeClock } from '@/renderer/presentation/features/boards/rangeClock';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

const competitionId = '11111111-1111-4111-8111-111111111111';

function snapshot(connected = true): MqttControlSnapshotDto {
  return {
    connected,
    brokerUrl: 'mqtt://localhost:1883',
    activeCompetitionId: competitionId,
    lanes: [],
    competitions: [
      {
        competitionId,
        competitionTypeId: 'ISSF:2026:AR60:FINAL',
        competitionTypeName: '10m Air Rifle Final',
        discipline: 'AIR_RIFLE',
        roundName: 'Final',
        acc: 'DECIMAL',
        phase: 'MATCH',
        shotsPerSeries: 5,
        totalSeries: 7,
        totalShots: 24,
        laneIds: [],
        startedAt: '2026-09-01T10:00:00.000Z',
        finishedAt: null,
        activeTimer: {
          timerScope: 'SERIES',
          timerStartAt: '2026-09-01T10:00:03.000Z',
          timerDurationSeconds: 250,
          stageIndex: 1,
          seriesIndex: 0,
        },
        publishedAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    lastCommand: null,
  };
}

describe('projectAuthoritativeRangeClock', () => {
  it('uses the Director absolute timer for scheduled and running countdowns', () => {
    expect(projectAuthoritativeRangeClock(snapshot(), undefined, Date.parse('2026-09-01T10:00:01.000Z'))).toMatchObject(
      {
        status: 'SCHEDULED',
        startsInSeconds: 2,
        remainingSeconds: 250,
        source: 'DIRECTOR_COMPETITION_STATE',
      },
    );
    expect(projectAuthoritativeRangeClock(snapshot(), undefined, Date.parse('2026-09-01T10:00:13.100Z'))).toMatchObject(
      {
        status: 'RUNNING',
        startsInSeconds: null,
        remainingSeconds: 240,
      },
    );
  });

  it('expires at zero and reports MQTT loss without substituting a Lane timer', () => {
    expect(
      projectAuthoritativeRangeClock(snapshot(false), undefined, Date.parse('2026-09-01T10:05:00.000Z')),
    ).toMatchObject({
      status: 'EXPIRED',
      remainingSeconds: 0,
      synchronized: false,
    });
  });

  it('is explicitly unavailable when no Director competition state exists', () => {
    expect(projectAuthoritativeRangeClock(null, undefined, Date.now())).toMatchObject({
      status: 'UNAVAILABLE',
      remainingSeconds: null,
      competitionId: null,
    });
  });
});
