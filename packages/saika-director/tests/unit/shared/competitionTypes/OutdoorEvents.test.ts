import { ISSF_2026_RULE_PACKS, identifyRulePack } from '@sasakiuri/saika-rules';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  asSupportedLaneCompetitionType,
  getLaneCompetitionDefinition,
  getLaneCompetitionTiming,
} from '@/renderer/presentation/features/competition-control/supportedCompetitionTypes';
import { competitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { registerBuiltinCompetitionTypes } from '@/shared/competitionTypes/registerBuiltinCompetitionTypes';

describe('outdoor event selection and Lane commands', () => {
  beforeEach(() => {
    competitionTypeRegistry._reset();
    registerBuiltinCompetitionTypes();
  });
  afterEach(() => competitionTypeRegistry._reset());

  it.each(ISSF_2026_RULE_PACKS.filter((pack) => ['RIFLE_300M', 'PISTOL_50M'].includes(pack.discipline)))(
    'uses the same $eventCode definition for entries, results and remote operation',
    (pack) => {
      const entry = competitionTypeRegistry.get(pack.eventCode);
      const supported = asSupportedLaneCompetitionType(pack.eventCode);
      expect(supported).not.toBeNull();
      const remote = getLaneCompetitionDefinition(supported!);
      expect(entry.rulePackIdentity).toEqual(identifyRulePack(pack));
      expect(remote.rulePackIdentity).toEqual(entry.rulePackIdentity);
      expect(remote.laneProtocol).toEqual({
        discipline: pack.discipline,
        acc: 'RING',
        targetProfileId: pack.capabilities.target.scoringProfileId,
        scoringGaugeProfileId: pack.capabilities.target.scoringGaugeProfileId,
      });
      expect(getLaneCompetitionTiming(supported!).matchSeconds).toBe(
        pack.capabilities.courseOfFire.stages[1]!.timer.durationSeconds,
      );
      expect(entry.resultFormat.tieBreakPolicy).toBe('ISSF_FULL_RING');
      expect(entry.resultVerification).toEqual({ topIndividualResults: 10, topTeamResults: 3 });
    },
  );
});
