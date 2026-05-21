// SPDX-License-Identifier: MIT
/**
 * ShotIngestionHandler
 *
 * Handler factory for USB data reception → RecordShot command dispatch.
 * Verifies that an active session exists and guards shot acceptance in competition mode.
 */

import { RecordShotToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ShotData } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

export interface ShotIngestionDeps {
  commandBus: CommandBus;
  sessionRepository: ISessionRepository;
  competitionRepository: ICompetitionRepository;
}

export function createShotIngestionHandler(deps: ShotIngestionDeps): (shotData: ShotData) => Promise<void> {
  const { commandBus, sessionRepository, competitionRepository } = deps;

  return async (shotData: ShotData): Promise<void> => {
    const logger = getLogger();
    try {
      // In competition mode, the competition state is the source of truth for
      // the current session. Falling back to findActive() can select an older
      // unfinished session if stale rows exist in the local DB.
      const activeCompetition = await competitionRepository.findActive();
      if (activeCompetition && !activeCompetition.canAcceptShot()) {
        logger.debug('Shot rejected by competition guard', 'usb', {
          phase: activeCompetition.phase,
        });
        return;
      }

      const activeSession = activeCompetition?.sessionId
        ? await sessionRepository.findById(activeCompetition.sessionId)
        : await sessionRepository.findActive();

      if (!activeSession) {
        logger.warn('No active session for shot data', 'usb');
        return;
      }

      await commandBus.execute(RecordShotToken, {
        sessionId: activeSession.id,
        impactPoint: shotData.x !== null && shotData.y !== null ? new ImpactPoint(shotData.x, shotData.y) : null,
        timestamp: shotData.timestamp,
        deviceScore: shotData.score,
        mode: shotData.mode !== undefined ? Mode.fromValue(shotData.mode) : undefined,
      });

      logger.debug('Shot recorded via USB', 'usb', {
        sessionId: activeSession.id,
        x: shotData.x,
        y: shotData.y,
      });
    } catch (error) {
      logger.error(
        'Failed to record shot',
        'usb',
        error instanceof Error ? { error: error.stack } : { error: String(error) },
      );
    }
  };
}
