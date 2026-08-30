import type { ProductionOperationAssessmentDto } from '@/shared/ipc/contracts';
import type { ProductionOperationAction, ProductionOperationEntry } from './IProductionOperationRepository';

export type ProductionOperationMode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';

export interface IProductionOperationPolicy {
  assess(input: {
    competitionTypeId: string;
    roundName: string;
    phase: string;
    entries: readonly ProductionOperationEntry[];
  }): ProductionOperationAssessmentDto;
}

/** Replaceable policy for external audio/production systems; it performs no playback itself. */
export class IssfProductionOperationPolicy implements IProductionOperationPolicy {
  constructor(readonly mode: ProductionOperationMode = 'ADVISORY') {}

  assess(input: {
    competitionTypeId: string;
    roundName: string;
    phase: string;
    entries: readonly ProductionOperationEntry[];
  }): ProductionOperationAssessmentDto {
    if (this.mode === 'DISABLED') {
      return {
        mode: this.mode,
        musicRequired: false,
        musicPlaying: false,
        musicProgramApproved: false,
        finalProductionConfirmed: false,
        ready: true,
        mayProceed: true,
        guidance: [],
        ruleReferences: [],
      };
    }

    const musicRequired = ['SIGHTING', 'SIGHTING_COMPLETE', 'MATCH'].includes(input.phase);
    const musicPlaying = latestToggle(input.entries, 'MUSIC_STARTED', 'MUSIC_STOPPED');
    const musicProgramApproved = latestToggle(
      input.entries,
      'MUSIC_PROGRAM_APPROVED',
      'MUSIC_PROGRAM_APPROVAL_REVOKED',
    );
    const finalProductionConfirmed = latestToggle(
      input.entries,
      'FINAL_PRODUCTION_CONFIRMED',
      'FINAL_PRODUCTION_REVOKED',
    );
    const isFinal = input.roundName.toLowerCase() === 'final';
    const mixedTeam = input.competitionTypeId.includes('MIX');
    const approvalRecommended = isFinal || mixedTeam;
    const guidance: string[] = [];
    if (musicRequired && !musicPlaying)
      guidance.push('Start music for the active Preparation/Sighting or Match period.');
    if (approvalRecommended && !musicProgramApproved)
      guidance.push('Record Technical Delegate approval of the music programme.');
    if (isFinal && !finalProductionConfirmed) {
      guidance.push(
        'Confirm the Final production plan: sound technician, colour, lighting, announcements, commentary and staging.',
      );
    }
    const ready = guidance.length === 0;
    return {
      mode: this.mode,
      musicRequired,
      musicPlaying,
      musicProgramApproved,
      finalProductionConfirmed,
      ready,
      mayProceed: this.mode !== 'REQUIRED' || ready,
      guidance,
      ruleReferences: isFinal
        ? ['ISSF 6.11.8 a', 'ISSF 6.17.1.10 h', 'ISSF 6.17.1.11', 'ISSF 6.17.1.14 s']
        : mixedTeam
          ? ['ISSF 6.11.8 a', 'ISSF 6.18.4.3']
          : ['ISSF 6.11.8 a'],
    };
  }
}

function latestToggle(
  entries: readonly ProductionOperationEntry[],
  enabled: ProductionOperationAction,
  disabled: ProductionOperationAction,
): boolean {
  const latest = entries.filter((entry) => entry.action === enabled || entry.action === disabled).at(-1);
  return latest?.action === enabled;
}
