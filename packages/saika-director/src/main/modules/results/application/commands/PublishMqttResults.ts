// SPDX-License-Identifier: MIT
import type { LaneAssignmentPayload } from '@sasakiuri/saika-protocol/LaneAssignment';
import type { LaneScorePayload } from '@sasakiuri/saika-protocol/LaneScore';
import type { CompetitionShotPayload } from '@sasakiuri/saika-protocol/Shots';

export interface PublishMqttResultLane {
  laneId: string;
  assignment: LaneAssignmentPayload | null;
  score: LaneScorePayload | null;
  shots: CompetitionShotPayload[];
}

export interface PublishMqttResultsCommand {
  competitionId: string;
  competitionTypeId: string;
  eventId: string;
  relayNumber: number;
  lanes: PublishMqttResultLane[];
}

export interface PublishResultsResponse {
  savedCount: number;
  errors: string[];
}

/** A publication that saved nothing because of one error. */
export function failure(message: string): PublishResultsResponse {
  return { savedCount: 0, errors: [message] };
}
