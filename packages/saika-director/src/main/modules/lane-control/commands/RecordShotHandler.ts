import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { emitLaneControlUpdated } from './helpers/emitLaneControlUpdated';
import { Logger } from '@/shared/utils/Logger';

export interface RecordShotCommand {
  channel: number;
  shotNumber: number;
  score: number;
}

const logger = Logger.create('RecordShotHandler');

export class RecordShotHandler {
  constructor(
    private readonly repository: ILaneControlRepository,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: RecordShotCommand): Promise<void> {
    const lane = this.repository.findByChannel(command.channel);
    if (!lane || lane.phase !== 'ACTIVE') return;

    if (lane.isDuplicateShot(command.shotNumber)) {
      logger.debug(`Duplicate shot detected: channel=${command.channel}, shotNumber=${command.shotNumber}`);
      return;
    }

    try {
      const updated = lane.addShotByScore(command.score, Date.now(), command.shotNumber);
      this.repository.save(updated);
      emitLaneControlUpdated(this.eventBus, updated);
    } catch (err) {
      logger.warn(`Failed to add shot: channel=${command.channel}`, err);
    }
  }
}
