import type { IParticipantRepository } from '@/main/modules/championship';
import type { IResultVerificationSource } from '@/main/modules/result-verification';

import type { IEstBackupSubjectSource } from '../application/IEstBackupSubjectSource';

/** Adapts the same immutable Final revisions used by individual and Mixed Team RTS checks. */
export class FinalEstBackupSubjectSource implements IEstBackupSubjectSource {
  constructor(
    private readonly results: IResultVerificationSource,
    private readonly participants: Pick<IParticipantRepository, 'findByEventId'>,
  ) {}

  async load(input: Parameters<IEstBackupSubjectSource['load']>[0]) {
    const snapshot = await this.results.load(input.eventId);
    if (snapshot.eventId !== input.eventId || snapshot.resultScope !== 'FINAL')
      throw new Error('Wrong Final result scope');
    if (snapshot.issues.length) throw new Error(snapshot.issues.join('; '));
    if (input.resultKind === 'TEAM')
      throw new Error('Three-member team Finals are not supported by this result source');
    const mixed = input.resultKind === 'MIXED_TEAM';
    if ((input.keyType === 'TEAM_ID') !== mixed) throw new Error('Select a comparison key for the Final result kind');
    const participants = new Map(this.participants.findByEventId(input.eventId).map((p) => [p.id.value, p]));
    const results = snapshot.results
      .filter((result) => result.rank > 0 && result.classificationCode === null)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, snapshot.configuredIndividualChecks);
    if (!results.length) throw new Error('No ranked Final results are available for comparison');
    return results.map((result) => {
      if (result.participantId.startsWith('TEAM:') !== mixed) throw new Error('The Final result kind does not match');
      if (result.status !== 'confirmed' || result.projectionIssues.length)
        throw new Error('Complete the Final results and resolve scoring issues before comparison');
      const participant = participants.get(result.participantId);
      const key = mixed
        ? result.participantId.slice('TEAM:'.length)
        : input.keyType === 'PARTICIPANT_ID'
          ? result.participantId
          : input.keyType === 'START_NUMBER'
            ? participant?.officialEntry.startNumber
            : participant?.officialEntry.issfId;
      if (!key) throw new Error(`${result.playerName} has no ${input.keyType} for backup comparison`);
      return {
        resultBinding: {
          resultId: result.resultId,
          participantId: result.participantId,
          resultRevision: result.revision,
        },
        key,
        name: result.playerName,
        rank: result.rank,
        totalScore: result.totalScore,
        ...(result.shotScores ? { shotScores: [...result.shotScores] } : {}),
        ...(result.seriesScores ? { seriesScores: [...result.seriesScores] } : {}),
        interventionCount: result.decisionCount,
      };
    });
  }
}
