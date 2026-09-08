import { ISSF_2026_RULE_PACKS } from '@sasakiuri/saika-rules';

import { competitionTypeRegistry } from './CompetitionTypeRegistry';
import { BP60 } from './definitions/BP60';
import { BP60_FINAL } from './definitions/BP60_FINAL';
import { BR60S } from './definitions/BR60S';
import { BR60S_FINAL } from './definitions/BR60S_FINAL';
import { competitionTypeFromRulePack } from './fromRulePack';
import { IssfStandardStrategy } from './strategies/IssfStandardStrategy';

/** Registers built-in competition types and strategies. */
export function registerBuiltinCompetitionTypes(): void {
  competitionTypeRegistry.registerStrategy(new IssfStandardStrategy());
  competitionTypeRegistry.register(BR60S);
  competitionTypeRegistry.register(BR60S_FINAL);
  competitionTypeRegistry.register(BP60);
  competitionTypeRegistry.register(BP60_FINAL);
  for (const pack of ISSF_2026_RULE_PACKS) {
    competitionTypeRegistry.register(
      competitionTypeFromRulePack(pack, {
        includeTeamResults: pack.round !== 'FINAL' || pack.capabilities.team !== undefined,
      }),
    );
  }
}
