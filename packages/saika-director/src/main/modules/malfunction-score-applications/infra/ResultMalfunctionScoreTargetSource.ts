import type { IEventRepository } from '@/main/modules/championship';
import { qualificationScoreSourceDigest, type IResultRepository } from '@/main/modules/results';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { QualificationMalfunctionCase, MalfunctionScoreSheet } from '@/main/modules/qualification-malfunctions';
import type { IMalfunctionScoreApplicationTargetSource } from '../domain/MalfunctionScoreApplication';

export class ResultMalfunctionScoreTargetSource implements IMalfunctionScoreApplicationTargetSource {
  constructor(
    private readonly results: IResultRepository,
    private readonly events: IEventRepository,
    private readonly registry: CompetitionTypeRegistry,
  ) {}

  resolve(value: QualificationMalfunctionCase, sheet: MalfunctionScoreSheet) {
    const event = this.events.findById(value.eventId);
    if (!event) throw new Error('Event not found');
    const definition = this.registry.get(event.eventType.value);
    if (
      definition.id !== value.competitionTypeId ||
      definition.config.name !== 'Qualification' ||
      !value.rulePackIdentity ||
      !definition.rulePackIdentity ||
      !event.rulePackIdentity ||
      value.rulePackIdentity.id !== definition.rulePackIdentity.id ||
      value.rulePackIdentity.schemaVersion !== definition.rulePackIdentity.schemaVersion ||
      value.rulePackIdentity.id !== event.rulePackIdentity.id ||
      value.rulePackIdentity.schemaVersion !== event.rulePackIdentity.schemaVersion ||
      value.rulePackIdentity.fingerprint.value !== definition.rulePackIdentity.fingerprint.value ||
      value.rulePackIdentity.fingerprint.value !== event.rulePackIdentity.fingerprint.value
    )
      throw new Error('The application requires the exact Qualification Rule Pack recorded in the case');
    const candidates = this.results
      .findByCompetitionId(value.eventId, value.relayNumberSnapshot, value.competitionId)
      .filter((result) => result.participantId.value === value.participantId);
    if (candidates.length !== 1)
      throw new Error('Import one matching Lane result for this athlete, relay and competition first');
    const result = candidates[0]!;
    const layout = definition.config.stages.flatMap((stage, stageIndex) =>
      stage.type !== 'match'
        ? []
        : stage.series.flatMap((series, seriesIndex) =>
            series.purpose === 'POSITION_CHANGE_AND_SIGHTING' ? [] : [{ stageIndex, seriesIndex, shots: series.shots }],
          ),
    );
    const seriesIndex = layout.findIndex(
      (series) => series.stageIndex === value.stageIndex && series.seriesIndex === value.seriesIndex,
    );
    if (
      seriesIndex < 0 ||
      layout[seriesIndex]?.shots !== 5 ||
      layout.some((series) => series.shots !== 5) ||
      layout.length !== definition.resultFormat.totalSeries ||
      result.seriesScores.length !== layout.length ||
      result.shots.length !== definition.resultFormat.totalShots
    )
      throw new Error('Reconcile the complete five-shot series layout before applying this calculation');
    const originalScoresX10 = result.shots
      .slice(seriesIndex * 5, seriesIndex * 5 + 5)
      .map((score) => Math.round(score * 10));
    const original = sheet.input.original.map((shot) => shot.scoreX10).sort((a, b) => a - b);
    const recorded = originalScoresX10.slice(0, value.recordedShots).sort((a, b) => a - b);
    if (
      JSON.stringify(original) !== JSON.stringify(recorded) ||
      originalScoresX10.slice(value.recordedShots).some((score) => score !== 0) ||
      originalScoresX10.reduce((sum, score) => sum + score, 0) !== Math.round(result.seriesScores[seriesIndex]! * 10)
    )
      throw new Error('The original calculation row and unfilled slots do not match the imported source series');
    if (
      Math.round(result.totalScore * 10) !== result.seriesScores.reduce((sum, score) => sum + Math.round(score * 10), 0)
    )
      throw new Error('Reconcile the source total and series totals before score application');
    return {
      resultId: result.id.value,
      sourceDigest: qualificationScoreSourceDigest(result),
      seriesIndex,
      originalScoresX10,
    };
  }
}
