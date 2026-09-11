// SPDX-License-Identifier: MIT
import { z } from 'zod';

const Id = z.string().min(1).max(256);
const Text = z.string().max(2048);
const Count = z.number().int().nonnegative().safe();
const Score = z.number().nonnegative().finite().nullable();

export const VistaIdentitySchema = z.object({
  protocolVersion: z.literal(1),
  sourceId: Id,
  bootId: Id,
  kind: z.enum(['lane', 'director', 'display']),
  name: Text,
});
export type VistaIdentity = z.infer<typeof VistaIdentitySchema>;

export const VistaDefinitionSchema = z.object({
  id: Id,
  fingerprint: Id,
  eventCode: z.enum(['AR60', 'AP60', 'BR60S', 'BP60', 'AR60_FINAL', 'AP60_FINAL', 'BR60S_FINAL', 'BP60_FINAL']),
  name: Text,
  scoring: z.enum(['RING', 'DECIMAL']),
  target: z.object({
    profileId: Id,
    unit: z.literal('mm'),
    origin: z.literal('center'),
    xDirection: z.literal('right'),
    yDirection: z.literal('up'),
    rings: z
      .array(z.object({ score: z.number().int().min(1).max(10), diameter: z.number().positive().finite() }))
      .min(1)
      .max(10),
    blackDiameter: z.number().positive().finite(),
    outerDiameter: z.number().positive().finite(),
    shotDiameter: z.number().positive().finite(),
  }),
  stages: z.array(z.object({ name: Text, scored: z.boolean(), seriesShots: z.array(z.number().int().positive()) })),
});
export type VistaDefinition = z.infer<typeof VistaDefinitionSchema>;

export const VistaClockSchema = z.object({
  generation: Id,
  revision: Count,
  label: Text,
  state: z.enum(['running', 'stopped', 'expired']),
  remainingMs: z.number().nonnegative().finite(),
  sampledAt: z.number().finite(),
});

export const VistaShotSchema = z
  .object({
    id: Id,
    sequence: Count,
    x: z.number().finite().nullable(),
    y: z.number().finite().nullable(),
    score: z.number().min(0).max(10.9).finite().nullable(),
    mode: z.enum(['sighting', 'match', 'shoot-off']),
    stage: Count.nullable(),
    series: Count.nullable(),
    recorded: z.boolean(),
    corrected: z.boolean(),
  })
  .refine((shot) => (shot.x === null) === (shot.y === null), 'Coordinates must both be present or absent')
  .refine((shot) => (shot.stage === null) === (shot.series === null), 'Stage and series must both be known or unknown');

export const VistaParticipantSchema = z.object({
  id: Id,
  laneId: Id,
  laneName: Text,
  name: Text.nullable(),
  affiliation: Text.nullable(),
  assignmentRevision: Id,
  status: Text,
  dataState: z.enum(['live', 'stale', 'saved']),
  total: Score,
  shotCount: Count.nullable(),
  currentStage: Count,
  currentSeries: Count,
  mode: z.enum(['sighting', 'match', 'shoot-off']),
  series: z.array(z.object({ stage: Count, index: Count, total: Score })),
  shots: z.array(VistaShotSchema),
  historyComplete: z.boolean(),
  clock: VistaClockSchema.nullable(),
});
export type VistaParticipant = z.infer<typeof VistaParticipantSchema>;

export const VistaSubjectSchema = z.object({
  id: Id,
  label: Text,
  eventCode: Text,
  competition: Text.nullable(),
  relay: Text.nullable(),
  availability: z.enum(['available', 'unsupported']),
  reason: Text.nullable(),
});
export const VistaCatalogSchema = z.object({
  identity: VistaIdentitySchema,
  subjects: z.array(VistaSubjectSchema),
});
export type VistaCatalog = z.infer<typeof VistaCatalogSchema>;

export const VistaSnapshotSchema = z
  .object({
    protocolVersion: z.literal(1),
    sourceId: Id,
    subjectId: Id,
    generation: Id,
    revision: Count,
    capturedAt: z.number().finite(),
    label: Text,
    phase: Text,
    finished: z.boolean(),
    definition: VistaDefinitionSchema,
    participants: z.array(VistaParticipantSchema),
    clock: VistaClockSchema.nullable(),
    ranking: z
      .object({
        scope: Text,
        kind: z.enum(['competition', 'live', 'reference']),
        revision: Id,
        state: z.enum([
          'DRAFT',
          'PRELIMINARY',
          'PROTEST_PENDING',
          'PROTEST_CLOSED',
          'OFFICIAL',
          'FINAL',
          'REVIEW_REQUIRED',
          'UNVERIFIED',
        ]),
        rows: z.array(
          z.object({
            id: Id,
            rank: z.number().int().positive().nullable(),
            name: Text,
            affiliation: Text.nullable(),
            total: Score,
            classification: Text.nullable(),
          }),
        ),
      })
      .nullable(),
  })
  .superRefine((snapshot, context) => {
    const checkPosition = (
      stage: number,
      series: number,
      stagePath: Array<string | number>,
      seriesPath: Array<string | number>,
      shootOff = false,
    ): void => {
      const definition = snapshot.definition.stages[stage];
      if (!definition) {
        context.addIssue({ code: 'custom', path: stagePath, message: 'Stage is outside the selected definition' });
        return;
      }
      // Empty shot plans represent unlimited sighting series. Shoot-off
      // iterations are independent of the ordinary competition series plan.
      if (!shootOff && definition.seriesShots.length > 0 && series >= definition.seriesShots.length) {
        context.addIssue({ code: 'custom', path: seriesPath, message: 'Series is outside the selected definition' });
      }
    };
    const participants = new Set<string>();
    for (const [participantIndex, participant] of snapshot.participants.entries()) {
      if (participants.has(participant.id)) context.addIssue({ code: 'custom', message: 'Duplicate participant' });
      participants.add(participant.id);
      const path = ['participants', participantIndex];
      checkPosition(
        participant.currentStage,
        participant.currentSeries,
        [...path, 'currentStage'],
        [...path, 'currentSeries'],
        participant.mode === 'shoot-off',
      );
      for (const [seriesIndex, series] of participant.series.entries()) {
        checkPosition(
          series.stage,
          series.index,
          [...path, 'series', seriesIndex, 'stage'],
          [...path, 'series', seriesIndex, 'index'],
        );
      }
      const shots = new Set<string>();
      for (const [shotIndex, shot] of participant.shots.entries()) {
        if (shots.has(shot.id)) context.addIssue({ code: 'custom', message: 'Duplicate shot' });
        shots.add(shot.id);
        if (
          shot.score !== null &&
          (snapshot.definition.scoring === 'RING'
            ? !Number.isInteger(shot.score) || shot.score > 10
            : shot.score !== Math.round(shot.score * 10) / 10)
        ) {
          context.addIssue({
            code: 'custom',
            path: [...path, 'shots', shotIndex, 'score'],
            message:
              snapshot.definition.scoring === 'RING'
                ? 'Shot score must be an integer from 0 to 10 for RING scoring'
                : 'Shot score must use at most one decimal place for DECIMAL scoring',
          });
        }
        if (shot.stage !== null && shot.series !== null) {
          checkPosition(
            shot.stage,
            shot.series,
            [...path, 'shots', shotIndex, 'stage'],
            [...path, 'shots', shotIndex, 'series'],
            shot.mode === 'shoot-off',
          );
        }
      }
    }
    const ranks = new Set<string>();
    for (const row of snapshot.ranking?.rows ?? []) {
      if (ranks.has(row.id)) context.addIssue({ code: 'custom', message: 'Duplicate result row' });
      ranks.add(row.id);
    }
    const target = snapshot.definition.target;
    if (
      target.blackDiameter > target.outerDiameter ||
      target.rings.some((ring) => ring.diameter > target.outerDiameter)
    ) {
      context.addIssue({ code: 'custom', message: 'Target rings and black area must fit the declared face' });
    }
    if (new Set(target.rings.map((ring) => ring.score)).size !== target.rings.length)
      context.addIssue({ code: 'custom', message: 'Duplicate target ring' });
  });
export type VistaSnapshot = z.infer<typeof VistaSnapshotSchema>;

/** Read-only source API. Entire snapshots replace earlier revisions atomically. */
export const VISTA_CATALOG_PATH = '/vista/v1/catalog';
export const vistaSnapshotPath = (subjectId: string): string => `/vista/v1/snapshot/${encodeURIComponent(subjectId)}`;
