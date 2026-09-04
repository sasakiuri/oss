import type { IParticipantRepository } from '@/main/modules/championship';
import type { ILaneControlRepository } from '@/main/modules/lane-control';

import type {
  IQualificationMalfunctionSubjectResolver,
  QualificationMalfunctionSubjectSnapshot,
} from '../domain/IQualificationMalfunctionSubjectResolver';

export class DirectorQualificationMalfunctionSubjectResolver implements IQualificationMalfunctionSubjectResolver {
  constructor(
    private readonly participants: IParticipantRepository,
    private readonly lanes: ILaneControlRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  resolve(
    input: Parameters<IQualificationMalfunctionSubjectResolver['resolve']>[0],
  ): QualificationMalfunctionSubjectSnapshot {
    const participant = this.participants.findById(input.participantId);
    if (!participant) throw new Error(`Participant ${input.participantId} not found`);
    if (participant.eventId.value !== input.eventId) {
      throw new Error(`Participant ${input.participantId} does not belong to event ${input.eventId}`);
    }
    if (input.reportSource === 'DIRECTOR_MANUAL') {
      return {
        participantName: participant.playerName,
        startNumber: participant.officialEntry.startNumber,
        laneSnapshotCapturedAt: null,
      };
    }

    const lane = this.lanes.findById(input.laneId);
    if (!lane) throw new Error(`Lane ${input.laneId} not found`);
    if (lane.channel.value !== input.laneChannel || lane.relayNumber !== input.relayNumber) {
      throw new Error('Lane signal context does not match the live channel and relay');
    }
    if (lane.player?.participantId !== input.participantId) {
      throw new Error('Lane signal participant does not match the athlete assigned to the Lane');
    }
    if (lane.stageIndex !== input.stageIndex || lane.seriesIndex !== input.seriesIndex) {
      throw new Error('Lane signal stage and series do not match the live Lane state');
    }
    if (lane.shotSlotInSeries !== input.recordedShots) {
      throw new Error('Lane signal recorded-shot count does not match the live Lane state');
    }
    return {
      participantName: participant.playerName,
      startNumber: participant.officialEntry.startNumber,
      laneSnapshotCapturedAt: validDate(this.now()),
    };
  }
}

function validDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error('Subject snapshot clock returned an invalid date');
  return new Date(value.getTime());
}
