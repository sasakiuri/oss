// SPDX-License-Identifier: MIT
import { commandSchemasForScope, type MqttCommandScope } from '@sasakiuri/saika-protocol/commands';
import { describe, expect, it } from 'vitest';

import { BROADCAST_COMMANDS } from '@/main/modules/mqtt/application/commands/BroadcastCommandHandler';
import type { LaneCommandTable } from '@/main/modules/mqtt/application/commands/LaneCommandProcessor';
import { TIER1_COMMANDS } from '@/main/modules/mqtt/application/commands/LaneTier1CommandHandler';
import { PER_LANE_COMMANDS } from '@/main/modules/mqtt/application/commands/PerLaneCommandHandler';
import { laneCommandSchemas } from '@/main/modules/mqtt/domain/MqttCommandSchemas';

function actionsWhere<Table extends LaneCommandTable>(
  table: Table,
  predicate: (policy: Table[keyof Table]) => boolean,
): string[] {
  return Object.entries(table)
    .filter(([, policy]) => predicate(policy as Table[keyof Table]))
    .map(([action]) => action)
    .sort();
}

describe.each([
  ['competition', BROADCAST_COMMANDS],
  ['competition-lane', PER_LANE_COMMANDS],
  ['lane', TIER1_COMMANDS],
] as const)('%s command table', (scope: MqttCommandScope, table: LaneCommandTable) => {
  it('accepts exactly the protocol actions of its scope with the Lane payload schemas', () => {
    const schemas = commandSchemasForScope(laneCommandSchemas, scope);
    expect(Object.keys(table).sort()).toEqual(Object.keys(schemas).sort());
    for (const [action, descriptor] of Object.entries(table)) {
      expect(descriptor.schema).toBe(schemas[action as keyof typeof schemas]);
    }
  });
});

describe('competition broadcast command policies', () => {
  it('requires a READY Lane for every action', () => {
    expect(actionsWhere(BROADCAST_COMMANDS, (policy) => !policy.requiresReady)).toEqual([]);
  });

  it('skips Lanes outside targetLaneIds for the targeted actions', () => {
    expect(actionsWhere(BROADCAST_COMMANDS, (policy) => policy.targeted)).toEqual(
      [
        'start-sighting',
        'start-shoot-off',
        'stop-shoot-off',
        'start-timed-target',
        'cancel-timed-target',
        'record-timed-target-unload',
      ].sort(),
    );
  });

  it('checks Director clock drift for the timer actions', () => {
    expect(actionsWhere(BROADCAST_COMMANDS, (policy) => policy.timer)).toEqual(
      ['start-sighting', 'start-match', 'timer-started', 'start-shoot-off', 'start-timed-target'].sort(),
    );
  });

  it('runs only closing actions during a safety stop and ignores timer expiry', () => {
    expect(actionsWhere(BROADCAST_COMMANDS, (policy) => policy.whileSafetyStopped === 'run')).toEqual(
      [
        'end-sighting',
        'finish-competition',
        'stop-shoot-off',
        'cancel-timed-target',
        'record-timed-target-unload',
      ].sort(),
    );
    expect(actionsWhere(BROADCAST_COMMANDS, (policy) => policy.whileSafetyStopped === 'ignore')).toEqual([
      'timer-expired',
    ]);
  });

  it('runs only closing actions during a Lane interruption and ignores timer expiry', () => {
    expect(actionsWhere(BROADCAST_COMMANDS, (policy) => policy.whileInterrupted === 'run')).toEqual(
      ['stop-shoot-off', 'cancel-timed-target', 'record-timed-target-unload'].sort(),
    );
    expect(actionsWhere(BROADCAST_COMMANDS, (policy) => policy.whileInterrupted === 'ignore')).toEqual([
      'timer-expired',
    ]);
  });
});

describe('per-Lane command policies', () => {
  it('requires a READY Lane for every action', () => {
    expect(actionsWhere(PER_LANE_COMMANDS, (policy) => !policy.requiresReady)).toEqual([]);
  });

  it('lets only the transfer itself and evidence reads run while a reserve transfer is pending', () => {
    expect(actionsWhere(PER_LANE_COMMANDS, (policy) => policy.allowedDuringReserveTransfer)).toEqual(
      ['reserve-lane-transfer', 'read-malfunction-firing'].sort(),
    );
  });

  it('blocks starting or resuming firing during a safety stop', () => {
    expect(actionsWhere(PER_LANE_COMMANDS, (policy) => policy.blockedWhileSafetyStopped)).toEqual(
      [
        'start-malfunction-firing',
        'resume-timer',
        'resume-match',
        'start-qualification-recovery',
        'cancel-qualification-recovery',
      ].sort(),
    );
  });
});

describe('Lane Tier 1 command policies', () => {
  it('requires a READY Lane only to join a competition', () => {
    expect(actionsWhere(TIER1_COMMANDS, (policy) => policy.requiresReady)).toEqual(['join-competition']);
  });
});
