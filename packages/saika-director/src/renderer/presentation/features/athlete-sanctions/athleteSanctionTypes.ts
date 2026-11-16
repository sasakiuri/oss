import type {
  AthleteSanctionDecisionDto,
  CreateAthleteIdentityPayload,
  ImposeAthleteSanctionPayload,
  LinkAthleteParticipantPayload,
  RevokeAthleteSanctionPayload,
  SynchronizeIssfAthleteIdentitiesPayload,
  UnlinkAthleteParticipantPayload,
} from '@/shared/ipc/contracts';

export type ClassificationCode = AthleteSanctionDecisionDto['classificationCode'];
export type AuthorityBasis = AthleteSanctionDecisionDto['authorityBasis'];
export type OfficialRole = AthleteSanctionDecisionDto['officialRole'];
/** The authority a DSQ rests on; DQB and AD-DSQ have a fixed authority. */
export type DsqBasis = 'JURY_MAJORITY' | 'POST_COMPETITION_CHECK';
export type LinkBasis = LinkAthleteParticipantPayload['linkBasis'];

/** Each command shows its notice and the returned workspace; true means it succeeded. */
export interface AthleteSanctionCommands {
  synchronize: (input: SynchronizeIssfAthleteIdentitiesPayload) => Promise<boolean>;
  createIdentity: (input: CreateAthleteIdentityPayload) => Promise<boolean>;
  linkParticipant: (input: LinkAthleteParticipantPayload) => Promise<boolean>;
  unlinkParticipant: (input: UnlinkAthleteParticipantPayload) => Promise<boolean>;
  imposeSanction: (input: ImposeAthleteSanctionPayload) => Promise<boolean>;
  revokeSanction: (input: RevokeAthleteSanctionPayload) => Promise<boolean>;
}
