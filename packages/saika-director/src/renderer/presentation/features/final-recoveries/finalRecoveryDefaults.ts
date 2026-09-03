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
    return { procedureProfile, phase: definition?.timedTarget ? 'MATCH_SERIES' : 'MATCH_SINGLE' };
  }
  return { procedureProfile, phase: 'OTHER' };
}
