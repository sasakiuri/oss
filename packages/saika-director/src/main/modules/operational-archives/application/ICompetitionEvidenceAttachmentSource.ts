import type { CompetitionEvidenceSection } from '../domain/CompetitionEvidenceBundle';

/** Receives a fixed metadata snapshot; implementations must not expand its competition scope. */
export interface ICompetitionEvidenceAttachmentSource {
  collect(sections: readonly CompetitionEvidenceSection[]): Promise<readonly CompetitionEvidenceSection[]>;
}
