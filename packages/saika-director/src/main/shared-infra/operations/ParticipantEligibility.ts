export interface ParticipantEligibilityAssessment {
  readonly participantId: string;
  readonly eligible: boolean;
  readonly blockingCode: string | null;
  readonly decisionIds: readonly string[];
  readonly reason: string | null;
}

/** Consumer-neutral port used before assigning an official participant to a Lane. */
export interface IParticipantEligibilityReader {
  assess(participantId: string): ParticipantEligibilityAssessment;
}

export const allowAllParticipantEligibility: IParticipantEligibilityReader = Object.freeze({
  assess: (participantId: string) => ({
    participantId,
    eligible: true,
    blockingCode: null,
    decisionIds: [],
    reason: null,
  }),
});

export function assertParticipantEligible(reader: IParticipantEligibilityReader, participantId: string): void {
  const assessment = reader.assess(participantId);
  if (assessment.eligible) return;
  throw new Error(
    `Participant ${participantId} is not eligible for Lane assignment` +
      `${assessment.blockingCode ? ` (${assessment.blockingCode})` : ''}` +
      `${assessment.reason ? `: ${assessment.reason}` : ''}`,
  );
}
