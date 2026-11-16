// SPDX-License-Identifier: MIT
import type { EstInspectionStartService } from '@/main/modules/est-championship-inspections';
import type { OperationalMode, OperationalSettingTarget } from '@/main/modules/operational-profiles';
import type { RelayReadinessService } from '@/main/modules/relay-readiness';

import { ClockQualityPolicy, type ClockQualityPolicyOptions } from '../domain/ClockQualityPolicy';
import type { TimedTargetReadinessSettings } from '../domain/TimedTargetReadinessPolicy';

type TimedTargetReadinessKey = keyof TimedTargetReadinessSettings;

/** The Director-wide policy settings these targets read and write. */
export interface OperationalPolicyConfig {
  get(key: 'timingEvidence.mode'): OperationalMode;
  set(
    key: 'timingEvidence.mode' | 'clockQuality.mode' | `timedTargetReadiness.${TimedTargetReadinessKey}`,
    mode: OperationalMode,
  ): void;
}

export interface OperationalProfileTargetsDependencies {
  /** Targets composed outside this module, listed first in the order given. */
  readonly composedTargets: readonly OperationalSettingTarget[];
  readonly relayReadiness: Pick<RelayReadinessService, 'getStartSettings' | 'setStartSettings'>;
  readonly estInspection: Pick<EstInspectionStartService, 'getSettings' | 'saveSettings'>;
  readonly config: OperationalPolicyConfig;
  readonly readClockQualitySettings: () => ClockQualityPolicyOptions & { readonly mode: OperationalMode };
  readonly applyClockQualityPolicy: (policy: ClockQualityPolicy) => void;
  readonly readTimedTargetReadinessSettings: () => TimedTargetReadinessSettings;
  /** True while any competition is between its first start and MATCH completion. */
  readonly hasActiveCompetition: () => boolean;
}

const timedTargetPolicies = [
  ['windowEnforcement', 'Lane firing-window enforcement'],
  ['boundedShotTiming', 'Lane measured shot timing'],
  ['physicalSignals', 'Integrated target signals'],
] as const satisfies readonly (readonly [TimedTargetReadinessKey, string])[];

/**
 * Lists every setting an operational profile can change. Director-scope settings are shared by all
 * competitions, so they refuse changes while another competition is running.
 */
export function createOperationalProfileTargets(
  deps: OperationalProfileTargetsDependencies,
): OperationalSettingTarget[] {
  const assertNoActiveCompetition = (message: string): void => {
    if (deps.hasActiveCompetition()) throw new Error(message);
  };
  return [
    ...deps.composedTargets.map((target) => ({
      ...target,
      write: (competitionId: string, mode: OperationalMode) => {
        if (target.scope === 'DIRECTOR')
          assertNoActiveCompetition('Finish active competitions before changing a shared Director policy');
        return target.write(competitionId, mode);
      },
    })),
    {
      id: 'relay',
      label: 'Relay readiness',
      scope: 'COMPETITION',
      read: (competitionId) => {
        const value = deps.relayReadiness.getStartSettings(competitionId);
        return { mode: value.mode, context: JSON.stringify(value) };
      },
      write: (competitionId, mode) => {
        deps.relayReadiness.setStartSettings({ ...deps.relayReadiness.getStartSettings(competitionId), mode });
      },
    },
    {
      id: 'inspection',
      label: 'EST inspection',
      scope: 'COMPETITION',
      read: (competitionId) => {
        const value = deps.estInspection.getSettings(competitionId);
        return { mode: value.mode, context: JSON.stringify(value) };
      },
      write: (competitionId, mode) => {
        deps.estInspection.saveSettings({ ...deps.estInspection.getSettings(competitionId), mode });
      },
    },
    {
      id: 'timing-evidence',
      label: 'Lane measurement evidence, expiry and installation match',
      scope: 'DIRECTOR',
      read: () => ({
        mode: deps.config.get('timingEvidence.mode'),
        context: 'Applies before timed commands on every selected Lane.',
      }),
      write: (_competitionId, mode) => {
        assertNoActiveCompetition('Finish active competitions before changing shared timing evidence policy');
        deps.config.set('timingEvidence.mode', mode);
      },
    },
    {
      id: 'clock',
      label: 'Clock quality',
      scope: 'DIRECTOR',
      read: () => ({
        mode: deps.readClockQualitySettings().mode,
        context: JSON.stringify(deps.readClockQualitySettings()),
      }),
      write: (_competitionId, mode) => {
        assertNoActiveCompetition('Finish active competitions before changing the shared clock policy');
        const policy = new ClockQualityPolicy({ ...deps.readClockQualitySettings(), mode });
        deps.config.set('clockQuality.mode', mode);
        deps.applyClockQualityPolicy(policy);
      },
    },
    ...timedTargetPolicies.map(([key, label]): OperationalSettingTarget => ({
      id: `timed-target-${key}`,
      label,
      scope: 'DIRECTOR',
      read: () => ({
        mode: deps.readTimedTargetReadinessSettings()[key],
        context: 'Applies before timed target firing on every selected Lane.',
      }),
      write: (_competitionId, mode) => {
        assertNoActiveCompetition('Finish active competitions before changing a shared timed target policy');
        deps.config.set(`timedTargetReadiness.${key}`, mode);
      },
    })),
  ];
}
