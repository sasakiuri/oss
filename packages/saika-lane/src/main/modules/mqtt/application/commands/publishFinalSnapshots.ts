// SPDX-License-Identifier: MIT
import type { LaneCompetitionStatePublisher } from '@/main/modules/mqtt/application/LaneCompetitionStatePublisher';
import type { LaneScorePublisher } from '@/main/modules/mqtt/application/LaneScorePublisher';

/**
 * Publishes the retained state and score of a finished competition by ID, as findActive() no longer
 * returns it, and waits for both before the finishing command is acknowledged so the Director cannot
 * save and clear stale result data.
 */
export async function publishFinalSnapshots(
  publishers: {
    readonly competitionStatePublisher: Pick<LaneCompetitionStatePublisher, 'publishCurrentState'>;
    readonly scorePublisher: Pick<LaneScorePublisher, 'publishCurrentScore'>;
  },
  competitionId: string,
  commandId: string,
): Promise<void> {
  await Promise.all([
    publishers.competitionStatePublisher.publishCurrentState(competitionId, commandId),
    publishers.scorePublisher.publishCurrentScore(competitionId, commandId),
  ]);
}
