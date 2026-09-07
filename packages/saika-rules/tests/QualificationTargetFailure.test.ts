// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  ISSF_2026_25M_PISTOL_QUALIFICATION_RULE_PACKS,
  recommendQualificationTargetFailure,
  recommendQualificationTimedTargetInterruption,
} from '../src';

describe('Qualification target-system failure', () => {
  for (const pack of ISSF_2026_25M_PISTOL_QUALIFICATION_RULE_PACKS) {
    const recovery = pack.capabilities.timedTarget!.recovery;
    if (recovery.procedure !== 'QUALIFICATION') throw new Error('Expected Qualification');
    for (const stage of recovery.targetFailure!.stages) {
      it(`${pack.id} ${stage.stageId}: short target failures require sighting and a pause`, () => {
        const facts = {
          stageId: stage.stageId,
          interruptionSeconds: 120,
          seriesShotLimit: 5,
          recordedShots: 2,
          seriesComplete: false,
        };
        const result = recommendQualificationTargetFailure(recovery.targetFailure!, facts);
        expect(result).toMatchObject({
          extraSighting: { required: true, shots: 5 },
          minimumPauseAfterSightingSeconds: 60,
        });
        expect(result.ruleReferences).toContain('8.10.1(c)');
        expect(recommendQualificationTimedTargetInterruption(recovery, facts).extraSighting.required).toBe(false);
        expect(result.seriesRecovery.shotsToFire).toBe(stage.seriesRecovery.treatment === 'ANNUL_AND_REPEAT' ? 5 : 3);
        if (result.seriesRecovery.execution?.mode === 'SECONDS_PER_SHOT')
          expect(result.seriesRecovery.execution.totalSeconds).toBe(144);
      });
      it(`${pack.id} ${stage.stageId}: a fully recorded series never permits repetition`, () => {
        const result = recommendQualificationTargetFailure(recovery.targetFailure!, {
          stageId: stage.stageId,
          interruptionSeconds: 1,
          seriesShotLimit: 5,
          recordedShots: 5,
          seriesComplete: false,
        });
        expect(result.seriesRecovery).toEqual({ treatment: 'KEEP_RECORDED_SERIES', shotsToFire: 0, execution: null });
        expect(result.extraSighting.required).toBe(true);
      });
    }
  }
});
