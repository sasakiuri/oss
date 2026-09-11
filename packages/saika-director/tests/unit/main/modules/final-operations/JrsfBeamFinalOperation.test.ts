// SPDX-License-Identifier: MIT
// @vitest-environment node
import { randomUUID } from 'node:crypto';

import { identifyRulePack, ISSF_2026_RULE_PACKS, JRSF_2026_RULE_PACKS, RulePackRegistry } from '@sasakiuri/saika-rules';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { allMigrations } from '@/main/infrastructure/database/migrations';
import { MigrationRunner } from '@/main/infrastructure/database/migrations/MigrationRunner';
import { FinalOperationService, SqliteFinalOperationRepository } from '@/main/modules/final-operations';
import { getLaneCompetitionDefinition } from '@/renderer/presentation/features/competition-control/supportedCompetitionTypes';
import { competitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { registerBuiltinCompetitionTypes } from '@/shared/competitionTypes/registerBuiltinCompetitionTypes';

describe('Built-in JRSF Beam Final operations', () => {
  it.each(JRSF_2026_RULE_PACKS)('creates and records a $eventCode shoot-off through the real service', (pack) => {
    const database = new Database(':memory:');
    competitionTypeRegistry._reset();
    try {
      new MigrationRunner(database).run(allMigrations);
      registerBuiltinCompetitionTypes();
      const definition = competitionTypeRegistry.get(pack.eventCode);
      expect(definition.rulePackIdentity).toEqual(identifyRulePack(pack));
      expect(definition.laneProtocol?.targetProfileId).toBe(pack.capabilities.target.scoringProfileId);
      expect(getLaneCompetitionDefinition(pack.eventCode as 'BR60S_FINAL' | 'BP60_FINAL')).toEqual(definition);
      const repository = new SqliteFinalOperationRepository(database);
      const service = new FinalOperationService(
        repository,
        competitionTypeRegistry,
        new RulePackRegistry([...ISSF_2026_RULE_PACKS, ...JRSF_2026_RULE_PACKS]),
      );
      const competitionId = randomUUID();
      const laneA = randomUUID();
      const laneB = randomUUID();
      let run = service.create({
        competitionId,
        competitionTypeId: pack.eventCode,
        scheduledStartAt: '2026-09-11T00:00:00.000Z',
        officialName: 'CRO',
      });
      expect(run.rulePackId).toBe(pack.id);
      expect(run.scriptSource?.organization).toBe('JRSF');
      const completeStep = () => {
        const confirmed = service.confirmStep({ runId: run.id, stepId: run.currentStep!.step.id, officialName: 'CRO' });
        run = service.recordExecution({
          runId: run.id,
          confirmationEntryId: confirmed.currentStep!.confirmationEntryId!,
          status: 'DONE',
          statement: 'Executed',
          officialName: 'CRO',
        });
      };
      while (run.currentStep?.step.effect.type !== 'CHECKPOINT') completeStep();
      run = service.startShootOff({
        runId: run.id,
        checkpointStepId: run.currentStep.step.id,
        eligibleLaneIds: [laneA, laneB],
        reason: 'The elimination position is tied.',
        officialName: 'Jury',
      });
      expect(run.currentBranch).toBe('SHOOT_OFF');
      expect(run.shootOff?.shotsPerLane).toBe(1);
      while (run.currentStep) completeStep();
      for (const [laneId, scoreX10] of [
        [laneA, 104],
        [laneB, 105],
      ] as const) {
        run = service.observeShootOffShot({
          runId: run.id,
          competitionId,
          iteration: 1,
          laneId,
          shotId: randomUUID(),
          scoreX10,
          x: null,
          y: null,
          firedAt: '2026-09-11T00:15:00.000Z',
        });
      }
      run = service.closeShootOffRound({
        runId: run.id,
        statement: 'Lane A is the unique lowest.',
        officialName: 'Jury',
      });
      expect(run.entries.at(-1)?.metadata).toMatchObject({ eliminatedLaneId: laneA, minimumScoreX10: 104 });
      expect(service.getByCompetition(competitionId)).toEqual(run);
      expect(repository.findRunById(run.id)?.script).toEqual(pack.capabilities.commands?.finalScript);
    } finally {
      competitionTypeRegistry._reset();
      database.close();
    }
  });
});
