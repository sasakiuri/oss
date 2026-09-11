// SPDX-License-Identifier: MIT
import type { VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';

import type { ScreenConfig } from '../src/shared/model';

export function snapshot(revision = 1): VistaSnapshot {
  return {
    protocolVersion: 1,
    sourceId: 'lane-one',
    subjectId: 'session-one',
    generation: 'reset-one',
    revision,
    capturedAt: Date.now(),
    label: 'Lane 1 · Air rifle',
    phase: 'MATCH',
    finished: false,
    definition: {
      id: 'AR60',
      fingerprint: 'a'.repeat(64),
      eventCode: 'AR60',
      name: '10m Air Rifle',
      scoring: 'DECIMAL',
      target: {
        profileId: 'issf-ar',
        unit: 'mm',
        origin: 'center',
        xDirection: 'right',
        yDirection: 'up',
        rings: [
          { score: 10, diameter: 0.5 },
          { score: 1, diameter: 45.5 },
        ],
        blackDiameter: 30.5,
        outerDiameter: 80,
        shotDiameter: 4.5,
      },
      stages: [{ name: 'Match', scored: true, seriesShots: [10, 10, 10, 10, 10, 10] }],
    },
    participants: [
      {
        id: 'athlete-one',
        laneId: 'lane-one',
        laneName: 'Lane 1',
        name: '\u5c04\u6483 \u592a\u90ce',
        affiliation: null,
        assignmentRevision: '1',
        status: 'Active',
        dataState: 'live',
        total: 10.2,
        shotCount: 1,
        currentStage: 0,
        currentSeries: 0,
        mode: 'match',
        series: [{ stage: 0, index: 0, total: 10.2 }],
        shots: [
          {
            id: 'shot-one',
            sequence: 1,
            x: 0.4,
            y: 1.2,
            score: 10.2,
            mode: 'match',
            stage: 0,
            series: 0,
            recorded: true,
            corrected: false,
          },
        ],
        historyComplete: true,
        clock: null,
      },
    ],
    clock: null,
    ranking: null,
  };
}

export function screenConfig(revision = 1): ScreenConfig {
  return {
    id: 'screen-one',
    monitorId: 'monitor-one',
    name: 'North stand',
    revision,
    view: 'targets',
    selections: [{ sourceId: 'lane-one', subjectId: 'session-one', participantIds: [], follow: 'lane', label: '' }],
    standby: false,
    slots: 4,
    autoRotate: true,
    pageSeconds: 5,
    page: 0,
    zoom: 1,
    shotFilter: 'all',
    recentShots: 5,
    autoStart: true,
  };
}

export function publishedSnapshot(revision = 1): VistaSnapshot {
  const current = snapshot(revision);
  current.label = 'Event results · all relays';
  current.participants[0]!.name = 'Current run athlete';
  current.participants[0]!.dataState = 'stale';
  current.participants[0]!.historyComplete = false;
  current.ranking = {
    scope: 'Air rifle · all relays',
    kind: 'competition',
    revision: String(revision),
    state: 'OFFICIAL',
    rows: [
      {
        id: 'earlier-athlete',
        rank: 1,
        name: 'Earlier relay winner',
        affiliation: 'Earlier club',
        total: 600,
        classification: null,
      },
      {
        id: 'athlete-one',
        rank: 2,
        name: 'Published athlete',
        affiliation: 'Published club',
        total: 590,
        classification: 'RPO',
      },
    ],
  };
  return current;
}
