// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  VISTA_CATALOG_PATH,
  VISTA_PROTOCOL_VERSION,
  VistaIdentitySchema,
  VistaShotSchema,
  VistaSnapshotSchema,
  parseVistaSourcePath,
  vistaSnapshotPath,
  type VistaParticipant,
  type VistaSnapshot,
} from '../src/Vista';

function snapshot(): VistaSnapshot {
  return {
    protocolVersion: 1,
    sourceId: 'lane',
    subjectId: 'final',
    generation: 'run',
    revision: 1,
    capturedAt: 1,
    label: 'Final',
    phase: 'ACTIVE',
    finished: false,
    definition: {
      id: 'final-definition',
      fingerprint: 'final-fingerprint',
      eventCode: 'AR60_FINAL',
      name: 'Air Rifle Final',
      scoring: 'DECIMAL',
      target: {
        profileId: 'air-rifle',
        unit: 'mm',
        origin: 'center',
        xDirection: 'right',
        yDirection: 'up',
        rings: [{ score: 10, diameter: 0.5 }],
        blackDiameter: 30.5,
        outerDiameter: 45.5,
        shotDiameter: 4.5,
      },
      stages: [
        { name: 'Sighting', scored: false, seriesShots: [] },
        { name: 'First stage', scored: true, seriesShots: [5, 5] },
        { name: 'Elimination', scored: true, seriesShots: Array<number>(14).fill(1) },
      ],
    },
    participants: [
      {
        id: 'athlete',
        laneId: 'lane',
        laneName: 'Lane 1',
        name: null,
        affiliation: null,
        assignmentRevision: 'assignment',
        status: 'ACTIVE',
        dataState: 'live',
        total: 10.4,
        shotCount: 1,
        currentStage: 1,
        currentSeries: 0,
        mode: 'match',
        series: [{ stage: 1, index: 0, total: 10.4 }],
        shots: [
          {
            id: 'shot',
            sequence: 1,
            x: 1,
            y: 1,
            score: 10.4,
            mode: 'match',
            stage: 1,
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

describe('Vista shot positions', () => {
  const shot = {
    id: 'shot-1',
    sequence: 1,
    x: null,
    y: null,
    score: 0,
    mode: 'match',
    recorded: true,
    corrected: false,
    stage: null,
    series: null,
  };

  it('keeps unproven shot positions explicit and accepts exact positions', () => {
    expect(VistaShotSchema.parse(shot)).toEqual(shot);
    expect(VistaShotSchema.parse({ ...shot, stage: 2, series: 13 })).toMatchObject({ stage: 2, series: 13 });
    expect(VistaShotSchema.safeParse({ ...shot, stage: 2 }).success).toBe(false);
    expect(VistaShotSchema.safeParse({ ...shot, series: 13 }).success).toBe(false);
  });
});

describe.each(['RING', 'DECIMAL'] as const)('Vista %s shot scores', (scoring) => {
  it.each(['sighting', 'match', 'shoot-off'] as const)(
    'preserves every valid score and unknown score in %s fire, including corrections',
    (mode) => {
      const scores = [
        null,
        ...Array.from({ length: scoring === 'RING' ? 11 : 110 }, (_, index) =>
          scoring === 'RING' ? index : index / 10,
        ),
      ];
      for (const score of scores) {
        for (const corrected of [false, true]) {
          const value = snapshot();
          value.definition.scoring = scoring;
          const participant = value.participants[0]!;
          participant.mode = mode;
          participant.currentStage = mode === 'sighting' ? 0 : 1;
          participant.shots[0] = {
            ...participant.shots[0]!,
            score,
            mode,
            stage: participant.currentStage,
            recorded: mode !== 'sighting',
            corrected,
          };
          expect(VistaSnapshotSchema.parse(value).participants[0]!.shots[0]).toEqual(participant.shots[0]);
        }
      }
    },
  );

  it.each(scoring === 'RING' ? [0.1, 9.9, 10.1, 10.9] : [0.01, 9.99, 10.04, 10.899])(
    'rejects %s without rounding and identifies the affected shot',
    (score) => {
      const value = snapshot();
      value.definition.scoring = scoring;
      value.participants[0]!.shots[0]!.score = score;
      const result = VistaSnapshotSchema.safeParse(value);
      expect(result.success).toBe(false);
      assert.ok(!result.success);
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['participants', 0, 'shots', 0, 'score'] }),
      );
      expect(value.participants[0]!.shots[0]!.score).toBe(score);
    },
  );
});

describe('Vista positions within the selected definition', () => {
  const invalidPositions: Array<[string, (participant: VistaParticipant) => void, Array<string | number>]> = [
    [
      'current stage',
      (participant) => {
        participant.currentStage = 3;
      },
      ['currentStage'],
    ],
    [
      'current series',
      (participant) => {
        participant.currentSeries = 2;
      },
      ['currentSeries'],
    ],
    [
      'series total stage',
      (participant) => {
        participant.series[0]!.stage = 3;
      },
      ['series', 0, 'stage'],
    ],
    [
      'series total index',
      (participant) => {
        participant.series[0]!.index = 2;
      },
      ['series', 0, 'index'],
    ],
    [
      'shot stage',
      (participant) => {
        participant.shots[0]!.stage = 3;
      },
      ['shots', 0, 'stage'],
    ],
    [
      'shot series',
      (participant) => {
        participant.shots[0]!.series = 2;
      },
      ['shots', 0, 'series'],
    ],
  ];

  it.each(invalidPositions)('rejects an out-of-range %s with its location', (_name, mutate, path) => {
    const value = snapshot();
    mutate(value.participants[0]!);
    const result = VistaSnapshotSchema.safeParse(value);
    expect(result.success).toBe(false);
    assert.ok(!result.success);
    expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ['participants', 0, ...path] }));
  });

  it('preserves unknown positions and accepts the last ordinary series', () => {
    const value = snapshot();
    const participant = value.participants[0]!;
    participant.currentStage = 2;
    participant.currentSeries = 13;
    participant.shots[0] = { ...participant.shots[0]!, stage: null, series: null };
    participant.historyComplete = false;
    expect(VistaSnapshotSchema.parse(value)).toEqual(value);
  });

  it('accepts unlimited sighting series and shoot-off iterations outside the match series plan', () => {
    const value = snapshot();
    const participant = value.participants[0]!;
    participant.currentStage = 0;
    participant.mode = 'sighting';
    participant.shots[0] = { ...participant.shots[0]!, mode: 'sighting', stage: 0, recorded: false };
    expect(VistaSnapshotSchema.parse(value)).toEqual(value);

    participant.currentStage = 2;
    participant.currentSeries = 99;
    participant.mode = 'shoot-off';
    participant.shots[0] = { ...participant.shots[0]!, mode: 'shoot-off', stage: 2, series: 99, recorded: true };
    expect(VistaSnapshotSchema.parse(value)).toEqual(value);

    participant.shots[0].stage = 3;
    expect(VistaSnapshotSchema.safeParse(value).success).toBe(false);
  });
});

describe('Vista protocol version', () => {
  it('stays version 1 in identities and snapshots', () => {
    expect(VISTA_PROTOCOL_VERSION).toBe(1);
    expectTypeOf({ protocolVersion: VISTA_PROTOCOL_VERSION }.protocolVersion).toEqualTypeOf<1>();
    const identity = { protocolVersion: 1, sourceId: 'lane', bootId: 'boot', kind: 'lane', name: 'Lane 1' };
    expect(VistaIdentitySchema.safeParse(identity).success).toBe(true);
    expect(VistaIdentitySchema.safeParse({ ...identity, protocolVersion: 2 }).success).toBe(false);
    expect(VistaSnapshotSchema.safeParse({ ...snapshot(), protocolVersion: 2 }).success).toBe(false);
  });
});

describe('Vista source paths', () => {
  it('keeps the released catalog and snapshot paths', () => {
    expect(VISTA_CATALOG_PATH).toBe('/vista/v1/catalog');
    expect(vistaSnapshotPath('relay 1/2')).toBe('/vista/v1/snapshot/relay%201%2F2');
  });

  it('reads the catalog path', () => {
    expect(parseVistaSourcePath(VISTA_CATALOG_PATH)).toEqual({ kind: 'catalog' });
  });

  it.each(['final', 'relay 1/2', 'a%b', 'snapshot?x=1#y', 'ä·漢', '..'])(
    'reads back the subject of a snapshot path for %j',
    (subjectId) => {
      expect(parseVistaSourcePath(vistaSnapshotPath(subjectId))).toEqual({ kind: 'snapshot', subjectId });
    },
  );

  it.each([
    '',
    '/',
    '/vista/v1/catalog/',
    '/vista/v1/identity',
    '/vista/v1/display/state',
    '/vista/v1/snapshot',
    '/vista/v1/snapshot/',
    '/vista/v1/snapshot/a/b',
    '/vista/v2/snapshot/a',
    'vista/v1/snapshot/a',
  ])('returns null for %j', (path) => {
    expect(parseVistaSourcePath(path)).toBeNull();
  });

  it('throws on a malformed escape in the subject ID', () => {
    expect(() => parseVistaSourcePath('/vista/v1/snapshot/%E0%A4%A')).toThrow(URIError);
  });
});
