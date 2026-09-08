import type { FinalRecoveryPhaseDto, FinalRecoveryProcedureProfileDto } from '@/shared/ipc/contracts';
import type { CompetitionPhase } from '@/shared/mqtt';

import {
  asSupportedLaneCompetitionType,
  getLaneCompetitionDefinition,
} from '../competition-control/supportedCompetitionTypes';

export interface FinalRecoveryDefaults {
  readonly procedureProfile: FinalRecoveryProcedureProfileDto;
  readonly phase: FinalRecoveryPhaseDto;
}

/** Derives UI defaults from optional capabilities while leaving both fields operator-editable. */
export function getFinalRecoveryDefaults(
  competitionTypeId: string | undefined,
  phase: CompetitionPhase,
  firingContext?: { purpose?: 'SIGHTING' | 'MATCH' | 'SHOOT_OFF'; shotsPerParticipant?: number },
): FinalRecoveryDefaults {
  const supportedType = asSupportedLaneCompetitionType(competitionTypeId);
  const definition = supportedType ? getLaneCompetitionDefinition(supportedType) : null;
  const recovery = definition?.timedTarget?.recovery;

  let procedureProfile: FinalRecoveryProcedureProfileDto;
  if (recovery?.procedure === 'FINAL' && recovery.allowableMalfunctionRemedy === 'REPEAT_SERIES') {
    procedureProfile = 'PISTOL_25M_RAPID_FIRE';
  } else if (recovery?.procedure === 'FINAL' && recovery.allowableMalfunctionRemedy === 'COMPLETE_SERIES') {
    procedureProfile = 'PISTOL_25M_WOMEN';
  } else if (definition?.teamFormat === 'MIXED_PAIR') {
    procedureProfile = 'RIFLE_PISTOL_10M_50M_MIXED_TEAM';
  } else {
    procedureProfile = 'RIFLE_PISTOL_10M_50M';
  }

  if (phase === 'SIGHTING' || phase === 'SIGHTING_COMPLETE') {
    return { procedureProfile, phase: 'SIGHTING' };
  }
  if (phase === 'MATCH' || phase === 'MATCH_COMPLETE') {
    if (firingContext?.purpose === 'SHOOT_OFF') return { procedureProfile, phase: 'SHOOT_OFF' };
    if (firingContext?.purpose === 'SIGHTING') return { procedureProfile, phase: 'SIGHTING' };
    const shots = firingContext?.shotsPerParticipant;
    return {
      procedureProfile,
      phase:
        shots && shots > 1
          ? 'MATCH_SERIES'
          : shots === 1
            ? 'MATCH_SINGLE'
            : definition?.timedTarget
              ? 'MATCH_SERIES'
              : 'OTHER',
    };
  }
  return { procedureProfile, phase: 'OTHER' };
}
