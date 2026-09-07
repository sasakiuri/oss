import type { FinalRecoveryAllowanceSubject } from './FinalRecoveryAuthorizationPolicy';
import type { FinalRecoveryProcedureProfile } from './FinalRecoveryCase';

export interface IFinalRecoverySubjectSource {
  resolve(input: {
    eventId?: string;
    affectedLaneIds: readonly string[];
    procedureProfile: FinalRecoveryProcedureProfile;
  }): FinalRecoveryAllowanceSubject | null;
}
