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
  ISSF_2026_AR60,
  ISSF_2026_AR60_FINAL,
  ISSF_2026_ARMIX30,
  ISSF_2026_ARMIX_FINAL,
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
}
