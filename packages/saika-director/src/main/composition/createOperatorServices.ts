// SPDX-License-Identifier: MIT
import {
  ChampionshipSanctionScoringDecisionAdmissionPolicy,
  ManualAttestationSanctionAuthorizationResolver,
} from '@/main/modules/athlete-sanctions';
import { SqliteEventRepository } from '@/main/modules/championship';
import { OfficialSigningPolicy } from '@/main/modules/official-signing';
import {
  directorOperatorPermission,
  OperatorAccessService,
  SessionSanctionAuthorizationResolver,
  SqliteOperatorAccessStore,
} from '@/main/modules/operator-access';
import {
  PublicationReviewPolicyService,
  SqlitePublicationReviewPolicyRepository,
} from '@/main/modules/publication-review-policies';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import type { CompetitionServices } from './createCompetitionServices';

type OperatorServicesDependencies = Pick<
  ServiceRegistry,
  'database' | 'competitionTypeRegistry' | 'appConfigService' | 'resultPublicationRepository'
> &
  Pick<CompetitionServices, 'finalResultDeclarationRepository'>;

/** Composes operator services from explicit dependencies. */
export function createOperatorServices({
  database,
  competitionTypeRegistry,
  appConfigService,
  resultPublicationRepository,
  finalResultDeclarationRepository,
}: OperatorServicesDependencies) {
  const operatorAccessStore = new SqliteOperatorAccessStore(database);
  const operatorAccessService = new OperatorAccessService(operatorAccessStore, directorOperatorPermission);
  const officialSigningPolicy = new OfficialSigningPolicy({
    currentActor: () => {
      const actor = operatorAccessService.currentActor();
      return actor ? { id: actor.id, name: actor.name, roles: actor.officialRoles } : null;
    },
    authenticationRequired: () => operatorAccessStore.enabled(),
    findActiveAccount: (id) => operatorAccessService.signingAccounts().find((actor) => actor.id === id) ?? null,
  });
  const policyEvents = new SqliteEventRepository(database, competitionTypeRegistry);
  const publicationReviewPolicies = new PublicationReviewPolicyService(
    new SqlitePublicationReviewPolicyRepository(database),
    () => ({
      requireObservationReviews: appConfigService.get('resultPublication.requireObservationReviews'),
      requireIncidentReports: appConfigService.get('resultPublication.requireIncidentReports'),
      requireFinalRecoveriesComplete: appConfigService.get('resultPublication.requireFinalRecoveriesComplete'),
      requireProtestCasesComplete: appConfigService.get('resultPublication.requireProtestCasesComplete'),
      requireEquipmentChecksComplete: appConfigService.get('resultPublication.requireEquipmentChecksComplete'),
    }),
    (eventId, scope) => {
      const event = policyEvents.findById(eventId);
      if (!event || event.round.value !== (scope === 'FINAL' ? 'Final' : 'Qualification')) return false;
      return (
        !resultPublicationRepository.findByEvent(eventId, scope).some((entry) => entry.type === 'OFFICIAL_PUBLISHED') &&
        (scope !== 'FINAL' || finalResultDeclarationRepository.findByEvent(eventId) === null)
      );
    },
    officialSigningPolicy,
  );
  const sanctionAuthorizationResolver = new SessionSanctionAuthorizationResolver(
    () => operatorAccessService.currentActor(),
    () => operatorAccessStore.enabled(),
    new ManualAttestationSanctionAuthorizationResolver(),
  );
  const scoringDecisionAdmissionPolicy = new ChampionshipSanctionScoringDecisionAdmissionPolicy();

  return {
    operatorAccessStore,
    operatorAccessService,
    officialSigningPolicy,
    policyEvents,
    publicationReviewPolicies,
    sanctionAuthorizationResolver,
    scoringDecisionAdmissionPolicy,
  };
}

export type OperatorServices = ReturnType<typeof createOperatorServices>;
