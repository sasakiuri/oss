import { competitionTypeRegistry } from './CompetitionTypeRegistry';
import { BR60S } from './definitions/BR60S';
import { BR60S_FINAL } from './definitions/BR60S_FINAL';
import { BP60 } from './definitions/BP60';
import { BP60_FINAL } from './definitions/BP60_FINAL';
import { IssfStandardStrategy } from './strategies/IssfStandardStrategy';

/** Registers built-in competition types and strategies. */
export function registerBuiltinCompetitionTypes(): void {
  competitionTypeRegistry.registerStrategy(new IssfStandardStrategy());
  competitionTypeRegistry.register(BR60S);
  competitionTypeRegistry.register(BR60S_FINAL);
  competitionTypeRegistry.register(BP60);
  competitionTypeRegistry.register(BP60_FINAL);
}
