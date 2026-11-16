// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import type { Contract, ProcedureMap } from '@sasakiuri/saika-ipc';

import { directorOperatorPermission } from '@/main/modules/operator-access/DirectorOperatorPermissions';
import type { OperatorPermission } from '@/shared/ipc/contracts';

const contracts = Object.values(
  import.meta.glob<Record<string, unknown>>('../../../../../src/shared/ipc/contracts/*.contract.ts', { eager: true }),
)
  .flatMap((module) => Object.values(module))
  .filter(
    (value): value is Contract<string, ProcedureMap> =>
      typeof value === 'object' && value !== null && 'procedures' in value,
  );

/** Each namespace's permission, then the operations that require a different one. */
const expected: Record<string, readonly [OperatorPermission, Record<string, OperatorPermission>?]> = {
  adjudicationCases: ['OFFICIATE'],
  athleteSanctions: ['OFFICIATE'],
  backupCaptureReadiness: ['OPERATE'],
  board: ['OPERATE', { openEstBackupSourcePrint: 'OFFICIATE', openProtestPrint: 'OFFICIATE' }],
  championship: ['ADMIN'],
  competitionAnnouncements: ['OPERATE'],
  debug: ['ADMIN'],
  eliminationPlanning: ['ADMIN'],
  equipmentRegistry: ['EQUIPMENT'],
  estBackupVerification: ['OFFICIATE'],
  estChampionshipInspections: ['EQUIPMENT'],
  estComplaints: ['OFFICIATE'],
  evidenceFiles: ['ADMIN'],
  finalControl: ['OPERATE', { recordDecision: 'OFFICIATE', voidDecision: 'OFFICIATE' }],
  finalOperations: ['OPERATE'],
  finalPlacementReview: ['OFFICIATE'],
  finalRecoveries: ['OFFICIATE'],
  finalRecoveryFiring: ['OPERATE'],
  incidentReports: ['OFFICIATE'],
  irregularShotCases: ['OFFICIATE'],
  malfunctionScoreApplications: ['OFFICIATE'],
  mixedTeamFinalControl: ['OPERATE', { recordDecision: 'OFFICIATE', voidDecision: 'OFFICIATE' }],
  mixedTeamTimeouts: ['OPERATE'],
  mqtt: [
    'OPERATE',
    { connect: 'ADMIN', disconnect: 'ADMIN', setBrokerConfig: 'ADMIN', startBroker: 'ADMIN', stopBroker: 'ADMIN' },
  ],
  observationReviews: ['OFFICIATE'],
  operationalArchives: ['ADMIN'],
  operationalProfiles: ['OPERATE'],
  operationalTemplates: ['OPERATE'],
  operatorAccess: ['ADMIN'],
  postCompetitionEquipmentControl: ['EQUIPMENT'],
  productionOperations: ['OPERATE'],
  protests: ['OFFICIATE'],
  publicationReviewPolicy: ['OFFICIATE'],
  qualificationMalfunctions: ['OFFICIATE'],
  rangeInterruptions: [
    'OPERATE',
    {
      adjudicateQualificationRecoveryExecution: 'OFFICIATE',
      appendEntry: 'OFFICIATE',
      applyQualificationRecoverySettlement: 'OFFICIATE',
      recordQualificationTimedTargetRecoveryDecision: 'OFFICIATE',
      recordTargetRecovery: 'OFFICIATE',
    },
  ],
  relayAthleteLifecycle: ['OPERATE'],
  relayReadiness: ['OPERATE'],
  reserveLaneTransfers: ['OPERATE'],
  resultPublication: ['OFFICIATE'],
  resultVerification: ['OFFICIATE'],
  results: ['OFFICIATE'],
  resultsBooks: ['OFFICIATE', { appointOfficial: 'ADMIN', revokeOfficial: 'ADMIN' }],
  scoreCorrections: ['OFFICIATE'],
  scoringDecisions: ['OFFICIATE'],
  shootoff: ['OPERATE'],
  squadding: ['ADMIN'],
  startLists: ['ADMIN'],
  targetExaminations: ['OFFICIATE'],
  teamResults: ['OFFICIATE'],
  'unified-lane-control': [
    'OPERATE',
    { deleteShot: 'OFFICIATE', editShot: 'OFFICIATE', eliminate: 'OFFICIATE', insertShot: 'OFFICIATE' },
  ],
  updater: ['ADMIN'],
  vista: ['ADMIN'],
};

describe('directorOperatorPermission', () => {
  it('resolves every contract procedure to its pinned permission', () => {
    expect(contracts.map((contract) => contract.namespace).sort()).toEqual(Object.keys(expected).sort());
    const actual: Record<string, OperatorPermission> = {};
    const pinned: Record<string, OperatorPermission> = {};
    for (const contract of contracts) {
      const [base, overrides = {}] = expected[contract.namespace]!;
      const operations = Object.keys(contract.procedures);
      expect(operations).toEqual(expect.arrayContaining(Object.keys(overrides)));
      for (const operation of operations) {
        const name = `${contract.namespace}.${operation}`;
        pinned[name] = overrides[operation] ?? base;
        actual[name] = directorOperatorPermission({
          namespace: contract.namespace,
          operation,
          kind: 'command',
          senderId: 1,
        });
      }
    }
    expect(actual).toEqual(pinned);
  });

  it('requires administration for a namespace it does not know', () => {
    for (const namespace of ['futureModule', 'constructor', 'toString'])
      expect(directorOperatorPermission({ namespace, operation: 'run', kind: 'command', senderId: 1 })).toBe('ADMIN');
  });
});
