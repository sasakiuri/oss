// SPDX-License-Identifier: MIT
export interface TimingProfileValidityFacts {
  readonly connectionRevision: string;
  readonly installationRevision?: string;
  readonly validUntil?: string;
}

export interface ITimingProfileValidityPolicy {
  issue(profile: TimingProfileValidityFacts, current: TimingProfileValidityFacts, now: Date): string | null;
}

/** Installation validity is independent of the measurement algorithm and firing-window rules. */
export class TimingProfileValidityPolicy implements ITimingProfileValidityPolicy {
  issue(profile: TimingProfileValidityFacts, current: TimingProfileValidityFacts, now: Date): string | null {
    if (profile.connectionRevision !== current.connectionRevision)
      return 'The saved target connection changed; review the installation and timing measurements';
    if (profile.installationRevision !== current.installationRevision)
      return 'The installation record changed; measure the current equipment, firmware, wiring and clock setup';
    if (profile.validUntil && Date.parse(profile.validUntil) <= now.getTime())
      return 'The timing measurement expired; save and apply a new measured profile';
    return null;
  }
}
