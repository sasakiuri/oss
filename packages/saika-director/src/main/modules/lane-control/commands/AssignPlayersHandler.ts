import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { AssignPlayersCommand } from './LaneCommands';
import { LaneControl } from '../domain/LaneControl';
import { Channel } from '../domain/Channel';
import { Player } from '../domain/Player';
import { buildRoundConfig } from '@/shared/constants/roundConfig';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import {
  assertParticipantEligible,
  allowAllParticipantEligibility,
  type IParticipantEligibilityReader,
} from '@/main/shared-infra/operations/ParticipantEligibility';

export class AssignPlayersHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
    private readonly competitionTypeRegistry: CompetitionTypeRegistry,
    private readonly participantEligibility: IParticipantEligibilityReader = allowAllParticipantEligibility,
  ) {}

  async execute(command: AssignPlayersCommand): Promise<void> {
    const assignedChannels = new Set<number>();
    const assignedParticipantIds = new Set<string>();
    for (const assignment of command.assignments) {
      if (assignedChannels.has(assignment.channel)) {
        throw DomainError.from(ErrorCatalog.LANE.DUPLICATE_CHANNEL_ASSIGNMENT);
      }
      assignedChannels.add(assignment.channel);

      if (assignment.participantId) {
        assertParticipantEligible(this.participantEligibility, assignment.participantId);
        if (assignedParticipantIds.has(assignment.participantId)) {
          throw DomainError.from(ErrorCatalog.LANE.DUPLICATE_PARTICIPANT_ASSIGNMENT);
        }
        assignedParticipantIds.add(assignment.participantId);
      }
    }

    const participantIdsOnUntouchedLanes = new Set(
      this.repository
        .findAll()
        .filter((lane) => !assignedChannels.has(lane.channel.value))
        .flatMap((lane) => (lane.player?.participantId ? [lane.player.participantId] : [])),
    );
    for (const participantId of assignedParticipantIds) {
      if (participantIdsOnUntouchedLanes.has(participantId)) {
        throw DomainError.from(ErrorCatalog.LANE.DUPLICATE_PARTICIPANT_ASSIGNMENT);
      }
    }

    const def = this.competitionTypeRegistry.get(command.eventType);

    const hasElimination = def.config.stages.some((s) => s.elimination !== undefined);
    const config = buildRoundConfig(def, hasElimination ? command.assignments.length : undefined);
    const updatedLanes: LaneControl[] = [];

    for (const assignment of command.assignments) {
      let lane = this.repository.findByChannel(assignment.channel);

      if (!lane) {
        lane = LaneControl.create(
          crypto.randomUUID(),
          Channel.create(assignment.channel),
          config,
          assignment.relayNumber ?? 1,
        );
      } else {
        lane = lane.withConfig(config);
      }

      const player = Player.create(
        assignment.playerName,
        assignment.affiliation,
        assignment.participantId,
        assignment.logoPath,
      );
      const updated = lane.assignPlayer(player, assignment.relayNumber);
      updatedLanes.push(updated);
    }

    for (const updated of updatedLanes) {
      this.repository.save(updated);
      emitLaneControlUpdated(this.eventBus, updated);
    }
  }
}
