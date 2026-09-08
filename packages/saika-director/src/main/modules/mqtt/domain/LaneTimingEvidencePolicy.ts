import type { CompetitionStartIssue } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import type { ShotTimingSettings } from '@/shared/mqtt/ShotTimingSettings';
import type { TimingEvidenceReport } from '@/shared/mqtt/TimingEvidenceReport';

export interface LaneTimingEvidenceFacts {
  connected: boolean;
  reportedAt?: string;
  connection?: { manufacturer?: string; deviceId?: string | null; portPath?: string };
  evidence?: TimingEvidenceReport;
  settings?: ShotTimingSettings;
}

/** Optional evidence gate, independent of clock synchronization and physical target actuation. */
export class LaneTimingEvidencePolicy {
  constructor(private readonly readMode: () => 'DISABLED' | 'ADVISORY' | 'REQUIRED' = () => 'DISABLED') {}

  assess(laneId: string, facts: LaneTimingEvidenceFacts, now = new Date()): CompetitionStartIssue[] {
    const mode = this.readMode();
    if (mode === 'DISABLED') return [];
    const evidence = facts.evidence;
    const age = now.getTime() - Date.parse(facts.reportedAt ?? '');
    const problems = new Set<string>();
    if (!facts.connected || !Number.isFinite(age) || age < 0 || age > 150_000)
      problems.add('A fresh connected Lane report is required');
    if (!evidence || evidence.state !== 'VERIFIED')
      problems.add(evidence?.issues.join('; ') || 'Apply a timing profile with verified measurement samples in Lane');
    if (evidence) {
      if (!evidence.profileId || !evidence.installationRevision || !evidence.measurementSha256)
        problems.add('The profile, installation and measurement evidence must be identified');
      const expiresAt = Date.parse(evidence.validUntil ?? '');
      const measuredAt = Date.parse(evidence.measuredAt ?? '');
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime())
        problems.add('Timing measurements need a future expiry');
      if (!Number.isFinite(measuredAt) || measuredAt > now.getTime())
        problems.add('Timing measurements must have a valid past measurement date');
      if (
        !evidence.connection ||
        !facts.connection ||
        evidence.connection.manufacturer !== facts.connection.manufacturer ||
        evidence.connection.deviceId !== (facts.connection.deviceId ?? '') ||
        evidence.connection.portPath !== facts.connection.portPath
      )
        problems.add('The connected target differs from the measured installation');
      const settings = facts.settings;
      if (
        !settings ||
        settings.mode !== 'BOUNDED' ||
        settings.maximumReceiptDelayMilliseconds === null ||
        settings.clockUncertaintyMilliseconds === null ||
        settings.mode !== evidence.settings.mode ||
        settings.maximumReceiptDelayMilliseconds !== evidence.settings.maximumReceiptDelayMilliseconds ||
        settings.clockUncertaintyMilliseconds !== evidence.settings.clockUncertaintyMilliseconds
      )
        problems.add('The active timing bounds differ from the measured profile');
    }
    return [...problems].map((message) => ({
      code: 'LANE_TIMING_EVIDENCE',
      blocking: mode === 'REQUIRED',
      message: `Lane ${laneId}: ${message}`,
    }));
  }
}
