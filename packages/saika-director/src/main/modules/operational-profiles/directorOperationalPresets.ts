import type { OperationalProfilePreset } from './OperationalProfilePreset';

/** Application assembly chooses these suggestions; they are not competition rules or device capabilities. */
export const directorOperationalPresets: readonly OperationalProfilePreset[] = [
  {
    id: 'officials-operated-targets',
    label: 'Officials operate target equipment',
    description:
      'Require relay preparation, EST inspection and clock checks. Target signals and shot timing remain under official supervision.',
    modes: {
      relay: 'REQUIRED',
      inspection: 'REQUIRED',
      clock: 'REQUIRED',
      'timing-evidence': 'ADVISORY',
      'timed-target-windowEnforcement': 'ADVISORY',
      'timed-target-boundedShotTiming': 'ADVISORY',
      'timed-target-physicalSignals': 'ADVISORY',
    },
  },
  {
    id: 'lane-operated-timed-targets',
    label: 'Lane controls timed targets',
    description:
      'Require measured timing, current installation evidence and connected target actuation and feedback before timed firing can start.',
    modes: {
      relay: 'REQUIRED',
      inspection: 'REQUIRED',
      clock: 'REQUIRED',
      'timing-evidence': 'REQUIRED',
      'timed-target-windowEnforcement': 'REQUIRED',
      'timed-target-boundedShotTiming': 'REQUIRED',
      'timed-target-physicalSignals': 'REQUIRED',
    },
  },
  {
    id: 'reviewed-publication',
    label: 'Review official results',
    description:
      'Require shot reviews, equipment checks, protests, incident reports and final recovery decisions before publication.',
    modes: {
      'publication-observations': 'REQUIRED',
      'publication-equipment': 'REQUIRED',
      'publication-protests': 'REQUIRED',
      'publication-incidents': 'REQUIRED',
      'publication-recoveries': 'REQUIRED',
    },
  },
  {
    id: 'automatic-backup-capture',
    label: 'Require automatic backup capture',
    description:
      'Require a current capture from the configured independent source. For independent printed backups, use the relay preparation check instead.',
    modes: { 'backup-capture': 'REQUIRED' },
  },
];
