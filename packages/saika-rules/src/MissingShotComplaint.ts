import type { MissingShotComplaintProcedure } from './RulePack';

/** Guidance is independent of firing permission, deadline adjudication and score correction. */
export function missingShotComplaintGuidance(procedure: MissingShotComplaintProcedure): string {
  const notification =
    procedure.notification === 'BEFORE_NEXT_SHOT'
      ? 'Inform the nearest range official immediately, before the next shot. Fire only the remaining unfired shots at the time decided by the Jury.'
      : 'Continue the five-shot series and inform the nearest range official immediately after the series ends.';
  return `${notification} No repeat series is allowed for this complaint. The RTS Jury determines the score after the target examination.`;
}
