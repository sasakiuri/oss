import type { ConnectionSettingsDto } from '@/shared/ipc/contracts';
import type { TimingProfileStatus } from '@/shared/ipc/contracts/timingProfiles.schema';
import { DEFAULT_TIMED_TARGET_TIMING_SETTINGS } from '@/shared/mqtt/TimedTargetTimingSettings';
import type { TimingEvidenceReport } from '@/shared/mqtt/TimingEvidenceReport';

import type { ITimingMeasurementAnalyzer } from '../domain/TimingMeasurementAnalyzer';

/** Rechecks retained measurements; neither changes active bounds nor decides whether firing is allowed. */
export class TimingEvidenceReporter {
  constructor(private readonly measurements: ITimingMeasurementAnalyzer) {}

  report(status: TimingProfileStatus, connection: ConnectionSettingsDto | null, now: Date): TimingEvidenceReport {
    const application = status.applications.find((entry) => entry.id === status.activeApplicationId);
    const profile = status.profiles.find((entry) => entry.id === application?.profileId);
    const issues: string[] = [];
    if (status.state !== 'ACTIVE') issues.push(status.issue ?? 'Apply a measured timing profile');
    if (!profile?.installationRevision || profile.installationRevision !== status.installation?.revision)
      issues.push('Record the current installation and measure that installation');
    if (!profile?.validUntil || Date.parse(profile.validUntil) <= now.getTime())
      issues.push('A future measurement expiry is required');
    if (!profile?.measuredAt || Date.parse(profile.measuredAt) > now.getTime())
      issues.push('The measurement date is missing or in the future');
    let invalid = status.state === 'REVIEW_REQUIRED';
    let measurementSha256: string | null = null;
    if (!profile?.measurementEvidence) issues.push('Retain the timing measurement samples');
    else {
      try {
        const { request, analysis } = profile.measurementEvidence;
        const recomputed = this.measurements.analyze(request);
        if (
          JSON.stringify(recomputed) !== JSON.stringify(analysis) ||
          JSON.stringify(recomputed.settings) !== JSON.stringify(profile.settings)
        )
          throw new Error('Retained measurement samples, analysis and profile bounds do not match');
        if (recomputed.receiptSamples === 0 || recomputed.clockSamples === 0)
          issues.push('Receipt-delay and clock-offset measurements are both required');
        measurementSha256 = recomputed.sourceSha256;
      } catch (error) {
        invalid = true;
        issues.push(error instanceof Error ? error.message : 'Measurement evidence could not be verified');
      }
    }
    return {
      state: invalid ? 'INVALID' : issues.length ? 'INCOMPLETE' : 'VERIFIED',
      profileId: profile?.id ?? null,
      measuredAt: profile?.measuredAt ?? null,
      validUntil: profile?.validUntil ?? null,
      installationRevision: profile?.installationRevision ?? null,
      measurementSha256,
      connection: connection
        ? {
            manufacturer: connection.manufacturer,
            deviceId: connection.deviceId ?? '',
            portPath: connection.portName,
          }
        : null,
      settings: status.settings,
      issues,
    };
  }

  unavailable(): TimingEvidenceReport {
    return {
      state: 'INVALID',
      profileId: null,
      measuredAt: null,
      validUntil: null,
      installationRevision: null,
      measurementSha256: null,
      connection: null,
      settings: { ...DEFAULT_TIMED_TARGET_TIMING_SETTINGS },
      issues: ['Timing evidence could not be read; review the saved profiles in Lane'],
    };
  }
}
