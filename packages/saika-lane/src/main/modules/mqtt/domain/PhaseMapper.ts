// SPDX-License-Identifier: MIT
import type { Phase } from '@/main/modules/competition/domain/Phase';

import { MqttLanePhase } from './MqttLanePhase';

export interface PhaseMapperContext {
  readonly scored: boolean;
  readonly isCompetitionFinished?: boolean;
  readonly isConnected?: boolean;
}

/**
 * Pure function that maps internal Phase + context → MqttLanePhase
 *
 * - Returns OFFLINE unconditionally when isConnected is false
 * - Determines the appropriate external phase from the combination of Phase and the scored flag
 */
export function mapToLanePhase(internalPhase: Phase, context: PhaseMapperContext): MqttLanePhase {
  if (context.isConnected === false) {
    return MqttLanePhase.OFFLINE;
  }

  switch (internalPhase) {
    case 'IDLE':
      return MqttLanePhase.READY;

    case 'ACTIVE':
      return context.scored === false ? MqttLanePhase.SIGHTING : MqttLanePhase.MATCH;

    case 'SERIES_COMPLETE':
      return context.isCompetitionFinished ? MqttLanePhase.FINISHED : MqttLanePhase.SERIES_COMPLETE;

    case 'SERIES_ENTERED':
      return MqttLanePhase.SERIES_COMPLETE;

    case 'STAGE_ENTERED':
      return MqttLanePhase.STAGE_COMPLETE;

    case 'FINISHED':
      return MqttLanePhase.FINISHED;
  }
}
