import type { IParticipantRepository } from '@/main/modules/championship';
import type { ILaneControlRepository } from '@/main/modules/lane-control';
import type { IFinalRecoverySubjectSource } from '../domain/IFinalRecoverySubjectSource';

/** Snapshots assignment identity once; recovery never re-resolves it after a Lane move. */
export class AssignedFinalRecoverySubjectSource implements IFinalRecoverySubjectSource {
  constructor(
    private readonly participants: IParticipantRepository,
    private readonly lanes: ILaneControlRepository,
  ) {}

  resolve(input: Parameters<IFinalRecoverySubjectSource['resolve']>[0]) {
    if (input.affectedLaneIds.length !== 1) return null;
    const participantId = this.lanes.findById(input.affectedLaneIds[0]!)?.player?.participantId;
    if (!participantId) return null;
    const participant = this.participants.findById(participantId);
    if (!participant || (input.eventId && participant.eventId.value !== input.eventId)) return null;
    if (input.procedureProfile === 'RIFLE_PISTOL_10M_50M_MIXED_TEAM') {
      const teamId = participant.officialEntry.teamId;
      return teamId
        ? {
            kind: 'TEAM' as const,
            key: `${participant.eventId.value}:${teamId}`,
            description: participant.officialEntry.teamName ?? teamId,
          }
        : null;
    }
    return { kind: 'ATHLETE' as const, key: participantId, description: participant.playerName };
  }
}
