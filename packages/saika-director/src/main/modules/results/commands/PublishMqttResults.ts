// SPDX-License-Identifier: MIT
import type { CompetitionShotPayload, LaneAssignmentPayload, LaneScorePayload } from '@/shared/mqtt';

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
