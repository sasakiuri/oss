import { competitionTypeRegistry } from './CompetitionTypeRegistry';
import { BR60S } from './definitions/BR60S';
import { BR60S_FINAL } from './definitions/BR60S_FINAL';
import { BP60 } from './definitions/BP60';
import { BP60_FINAL } from './definitions/BP60_FINAL';
import { IssfStandardStrategy } from './strategies/IssfStandardStrategy';
import {
  ISSF_2026_AP60,
  ISSF_2026_AP60_FINAL,
  ISSF_2026_APMIX30,
  ISSF_2026_APMIX_FINAL,
  ISSF_2026_CFP,
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_ARMIX30,
  ISSF_2026_ARMIX_FINAL,
  ISSF_2026_R3P60,
  ISSF_2026_R3P60_ELIMINATION,
  ISSF_2026_R3P60_INDOOR,
  ISSF_2026_R3P_FINAL,
  ISSF_2026_RPR60,
  ISSF_2026_RPR60_ELIMINATION,
  ISSF_2026_P25,
  ISSF_2026_P25_FINAL,
  ISSF_2026_RFPM,
  ISSF_2026_RFPM_FINAL,
  ISSF_2026_STDP,
} from '@sasakiuri/saika-rules';
import { competitionTypeFromRulePack } from './fromRulePack';

/** Registers built-in competition types and strategies. */
export function registerBuiltinCompetitionTypes(): void {
  competitionTypeRegistry.registerStrategy(new IssfStandardStrategy());
  competitionTypeRegistry.register(BR60S);
  competitionTypeRegistry.register(BR60S_FINAL);
  competitionTypeRegistry.register(BP60);
  competitionTypeRegistry.register(BP60_FINAL);
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_AR60, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_AR60_FINAL));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_AP60, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_AP60_FINAL));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_ARMIX30, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_APMIX30, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_ARMIX_FINAL, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_APMIX_FINAL, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_R3P60, { includeTeamResults: true }));
  competitionTypeRegistry.register(
    competitionTypeFromRulePack(ISSF_2026_R3P60_ELIMINATION, { includeTeamResults: true }),
  );
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_R3P60_INDOOR, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_RPR60, { includeTeamResults: true }));
  competitionTypeRegistry.register(
    competitionTypeFromRulePack(ISSF_2026_RPR60_ELIMINATION, { includeTeamResults: true }),
  );
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_R3P_FINAL));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_RFPM, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_P25, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_CFP, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_STDP, { includeTeamResults: true }));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_RFPM_FINAL));
  competitionTypeRegistry.register(competitionTypeFromRulePack(ISSF_2026_P25_FINAL));
}
