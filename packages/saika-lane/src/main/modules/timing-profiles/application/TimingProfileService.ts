// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';

import type { ConnectionSettingsDto } from '@/shared/ipc/contracts';
import type { TimingMeasurementRequest } from '@/shared/ipc/contracts/timingMeasurements.schema';
import {
  ApplyTimingProfileSchema,
  RecordTimingInstallationSchema,
  type RecordTimingInstallation,
  SaveTimingProfileSchema,
  type ApplyTimingProfile,
  type SaveTimingProfile,
  type TimingProfileStatus,
  type TimingProfileStore,
} from '@/shared/ipc/contracts/timingProfiles.schema';
import {
  DEFAULT_TIMED_TARGET_TIMING_SETTINGS,
  TimedTargetTimingSettingsSchema,
  type TimedTargetTimingSettings,
} from '@/shared/mqtt/TimedTargetTimingSettings';

import { TimingMeasurementAnalyzer, type ITimingMeasurementAnalyzer } from '../domain/TimingMeasurementAnalyzer';
import { TimingProfileValidityPolicy, type ITimingProfileValidityPolicy } from '../domain/TimingProfileValidityPolicy';

import { TimingEvidenceReporter } from './TimingEvidenceReporter';

export interface TimingProfileState extends TimingProfileStore {
  settings: TimedTargetTimingSettings;
}
export interface ITimingProfileStore {
  load(): TimingProfileState;
  /** Atomically persists the bounds and their associated profile state. */
  write(state: TimingProfileState): void;
}
export interface ITimingProfileEnvironment {
  connection(): ConnectionSettingsDto | null;
  hasActiveCompetition(): Promise<boolean>;
}
/** Installation evidence and configuration selection are independent of firing-window rules and hardware actuation. */
export class TimingProfileService {
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly store: ITimingProfileStore,
    private readonly environment: ITimingProfileEnvironment,
    private readonly now: () => Date = () => new Date(),
    private readonly measurements: ITimingMeasurementAnalyzer = new TimingMeasurementAnalyzer(),
    private readonly validity: ITimingProfileValidityPolicy = new TimingProfileValidityPolicy(),
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  evidenceReport() {
    const reporter = new TimingEvidenceReporter(this.measurements);
    try {
      return this.status().evidence!;
    } catch {
      return reporter.unavailable();
    }
  }

  private notifyChanged(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Observers must not change persistence outcomes. */
      }
    }
  }

  status(): TimingProfileStatus {
    const saved = this.store.load();
    const connection = this.connection();
    const status = {
      ...saved,
      revision: digest({ saved, connection }),
      connectionLabel: connection.label,
      ...this.assess(saved, connection.revision),
    };
    return {
      ...status,
      evidence: new TimingEvidenceReporter(this.measurements).report(status, this.environment.connection(), this.now()),
    };
  }

  effectiveSettings(): TimedTargetTimingSettings {
    try {
      const saved = this.store.load();
      if (!saved.activeApplicationId) return saved.settings;
      return this.assess(saved, this.connection().revision).settings;
    } catch {
      return { ...DEFAULT_TIMED_TARGET_TIMING_SETTINGS };
    }
  }

  private assess(
    saved: TimingProfileState,
    connectionRevision: string,
  ): Pick<TimingProfileStatus, 'state' | 'issue' | 'settings'> {
    const application = saved.applications.find((value) => value.id === saved.activeApplicationId);
    const profile = saved.profiles.find((value) => value.id === application?.profileId);
    let issue: string | null = null;
    if (saved.activeApplicationId) {
      if (!profile) issue = 'The applied timing profile is missing; select a measured profile or save manual settings';
      else {
        issue = this.validity.issue(
          profile,
          { connectionRevision, installationRevision: saved.installation?.revision },
          this.now(),
        );
        if (!issue && digest(profile.settings) !== digest(saved.settings))
          issue = 'The stored bounds no longer match the applied profile; review the timing settings';
      }
    }
    return {
      state: issue ? 'REVIEW_REQUIRED' : profile ? 'ACTIVE' : 'MANUAL',
      issue,
      settings: issue ? { ...DEFAULT_TIMED_TARGET_TIMING_SETTINGS } : saved.settings,
    };
  }

  analyzeMeasurements(input: TimingMeasurementRequest) {
    return this.measurements.analyze(input);
  }

  async save(input: SaveTimingProfile): Promise<TimingProfileStatus> {
    const { expectedRevision, measurements, ...profile } = SaveTimingProfileSchema.parse(input);
    await this.requireIdle();
    this.requireRevision(expectedRevision);
    const saved = this.store.load();
    if (saved.profiles.some((value) => value.id === profile.id))
      throw new Error('Profile IDs are immutable; use a new profile');
    if (Date.parse(profile.measuredAt) > this.now().getTime())
      throw new Error('Measurement time cannot be in the future');
    if (profile.validUntil && Date.parse(profile.validUntil) <= Date.parse(profile.measuredAt))
      throw new Error('The measurement expiry must be after its measurement time');
    const connection = this.connection();
    if (!connection.configured) throw new Error('Save the target connection before recording its measured timing');
    const analysis = measurements ? this.measurements.analyze(measurements) : null;
    if (analysis && digest(analysis.settings) !== digest(profile.settings))
      throw new Error('The profile bounds differ from the measurement analysis; analyze the current data again');
    this.store.write({
      ...saved,
      profiles: [
        ...saved.profiles,
        {
          ...profile,
          connectionRevision: connection.revision,
          connectionLabel: connection.label,
          recordedAt: this.now().toISOString(),
          ...(saved.installation
            ? {
                installationRevision: saved.installation.revision,
                installationDescription: saved.installation.description,
              }
            : {}),
          ...(analysis && measurements ? { measurementEvidence: { request: measurements, analysis } } : {}),
        },
      ],
    });
    this.notifyChanged();
    return this.status();
  }

  async apply(input: ApplyTimingProfile): Promise<TimingProfileStatus> {
    const request = ApplyTimingProfileSchema.parse(input);
    await this.requireIdle();
    this.requireRevision(request.expectedRevision);
    const saved = this.store.load();
    const profile = saved.profiles.find((value) => value.id === request.profileId);
    if (!profile) throw new Error('Timing profile was not found');
    if (profile.connectionRevision !== this.connection().revision)
      throw new Error('This profile belongs to a different target connection; review the measurements');
    const issue = this.validity.issue(
      profile,
      {
        connectionRevision: this.connection().revision,
        installationRevision: saved.installation?.revision,
      },
      this.now(),
    );
    if (issue) throw new Error(issue);
    const application = {
      id: randomUUID(),
      profileId: profile.id,
      officialName: request.officialName,
      appliedAt: this.now().toISOString(),
    };
    this.store.write({
      ...saved,
      settings: profile.settings,
      activeApplicationId: application.id,
      applications: [...saved.applications, application],
    });
    this.notifyChanged();
    return this.status();
  }

  async setManualSettings(input: TimedTargetTimingSettings): Promise<TimedTargetTimingSettings> {
    const settings = TimedTargetTimingSettingsSchema.parse(input);
    await this.requireIdle();
    const saved = this.store.load();
    this.store.write({ ...saved, settings, activeApplicationId: null });
    this.notifyChanged();
    return this.effectiveSettings();
  }

  async recordInstallation(input: RecordTimingInstallation): Promise<TimingProfileStatus> {
    const request = RecordTimingInstallationSchema.parse(input);
    await this.requireIdle();
    this.requireRevision(request.expectedRevision);
    const saved = this.store.load();
    this.store.write({
      ...saved,
      installation: {
        revision: randomUUID(),
        description: request.description,
        officialName: request.officialName,
        recordedAt: this.now().toISOString(),
      },
    });
    this.notifyChanged();
    return this.status();
  }

  private async requireIdle() {
    if (await this.environment.hasActiveCompetition())
      throw new Error('Finish the active competition before changing shot timing settings');
  }
  private requireRevision(revision: string) {
    if (revision !== this.status().revision)
      throw new Error('Timing settings, profiles or the connection changed; reload before continuing');
  }
  private connection() {
    const value = this.environment.connection();
    const canonical = value
      ? {
          manufacturer: value.manufacturer,
          deviceId: value.deviceId ?? '',
          portName: value.portName,
          serialNumber: value.serialNumber ?? '',
          vendorId: value.vendorId ?? '',
          productId: value.productId ?? '',
        }
      : null;
    return {
      revision: digest(canonical),
      configured: !!canonical?.portName,
      label: canonical
        ? [canonical.manufacturer, canonical.deviceId, canonical.portName, canonical.serialNumber]
            .filter(Boolean)
            .join(' / ')
        : 'No saved target connection',
    };
  }
}
function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
