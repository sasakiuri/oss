// SPDX-License-Identifier: MIT
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { MqttCommandActionOf } from '../src/commands';
import {
  MQTT_SINGLE_LEVEL_WILDCARD,
  mqttTopicFilters,
  mqttTopics,
  parseMqttTopic,
  type ParsedMqttTopic,
} from '../src/topics';

const competitionId = 'competition-id';
const laneId = 'lane-id';
const action = 'action-name';
// Command builders accept only released actions; the golden strings keep a neutral placeholder.
const laneAction = action as MqttCommandActionOf<'lane'>;
const competitionAction = action as MqttCommandActionOf<'competition'>;
const competitionLaneAction = action as MqttCommandActionOf<'competition-lane'>;
const requestId = 'request-id';
const any = MQTT_SINGLE_LEVEL_WILDCARD;

// Released wire contract: every string below is used by Lane or Director 0.4.x and must stay byte-identical.
const goldenTopics: Record<keyof typeof mqttTopics, readonly [built: string, wire: string]> = {
  laneHardwareState: [mqttTopics.laneHardwareState(laneId), 'saika/lane/lane-id/hardware/state'],
  laneHardwareShot: [mqttTopics.laneHardwareShot(laneId), 'saika/lane/lane-id/hardware/shot'],
  laneHardwareObservation: [mqttTopics.laneHardwareObservation(laneId), 'saika/lane/lane-id/hardware/observation'],
  laneSafetyState: [mqttTopics.laneSafetyState(laneId), 'saika/lane/lane-id/safety/state'],
  laneRangeOfficerRequest: [mqttTopics.laneRangeOfficerRequest(laneId), 'saika/lane/lane-id/range-officer/request'],
  laneQualificationMalfunctionSignal: [
    mqttTopics.laneQualificationMalfunctionSignal(laneId),
    'saika/lane/lane-id/qualification-malfunction/signal',
  ],
  laneEstComplaintSignal: [mqttTopics.laneEstComplaintSignal(laneId), 'saika/lane/lane-id/est-complaint/signal'],
  laneCommand: [mqttTopics.laneCommand(laneId, laneAction), 'saika/lane/lane-id/command/action-name'],
  laneCommandAcknowledgement: [
    mqttTopics.laneCommandAcknowledgement(laneId, action),
    'saika/lane/lane-id/command/action-name/acknowledgement',
  ],
  competitionState: [mqttTopics.competitionState(competitionId), 'saika/competition/competition-id/state'],
  competitionCue: [mqttTopics.competitionCue(competitionId), 'saika/competition/competition-id/cue'],
  laneCompetitionState: [
    mqttTopics.laneCompetitionState(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/state',
  ],
  laneAssignment: [
    mqttTopics.laneAssignment(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/assignment',
  ],
  laneScore: [mqttTopics.laneScore(competitionId, laneId), 'saika/competition/competition-id/lane/lane-id/score'],
  competitionShot: [
    mqttTopics.competitionShot(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/shot',
  ],
  competitionShotObservation: [
    mqttTopics.competitionShotObservation(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/observation',
  ],
  timedTargetState: [
    mqttTopics.timedTargetState(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/timed-target/state',
  ],
  competitionShootOffShot: [
    mqttTopics.competitionShootOffShot(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/shoot-off/shot',
  ],
  qualificationRecoveryState: [
    mqttTopics.qualificationRecoveryState(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/qualification-recovery/state',
  ],
  qualificationRecoveryShot: [
    mqttTopics.qualificationRecoveryShot(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/qualification-recovery/shot',
  ],
  competitionCommand: [
    mqttTopics.competitionCommand(competitionId, competitionAction),
    'saika/competition/competition-id/command/action-name',
  ],
  competitionCommandAcknowledgement: [
    mqttTopics.competitionCommandAcknowledgement(competitionId, action, laneId),
    'saika/competition/competition-id/command/action-name/acknowledgement/lane-id',
  ],
  laneCompetitionCommand: [
    mqttTopics.laneCompetitionCommand(competitionId, laneId, competitionLaneAction),
    'saika/competition/competition-id/lane/lane-id/command/action-name',
  ],
  laneCompetitionCommandAcknowledgement: [
    mqttTopics.laneCompetitionCommandAcknowledgement(competitionId, laneId, action),
    'saika/competition/competition-id/lane/lane-id/command/action-name/acknowledgement',
  ],
  laneQueryRequest: [
    mqttTopics.laneQueryRequest(competitionId, laneId, requestId),
    'saika/competition/competition-id/lane/lane-id/query/request-id/request',
  ],
  laneQueryResponse: [
    mqttTopics.laneQueryResponse(competitionId, laneId, requestId),
    'saika/competition/competition-id/lane/lane-id/query/request-id/response',
  ],
};

const goldenFilters: Record<keyof typeof mqttTopicFilters, readonly [built: string, wire: string]> = {
  laneCommands: [mqttTopicFilters.laneCommands(laneId), 'saika/lane/lane-id/command/+'],
  laneHardware: [mqttTopicFilters.laneHardware(any), 'saika/lane/+/hardware/#'],
  competition: [mqttTopicFilters.competition(any), 'saika/competition/+/#'],
  competitionCommands: [
    mqttTopicFilters.competitionCommands(competitionId),
    'saika/competition/competition-id/command/+',
  ],
  laneCompetitionCommands: [
    mqttTopicFilters.laneCompetitionCommands(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/command/+',
  ],
  laneQueryRequests: [
    mqttTopicFilters.laneQueryRequests(competitionId, laneId),
    'saika/competition/competition-id/lane/lane-id/query/+/request',
  ],
};

// Identifiers each topic carries, keyed by builder name; parseMqttTopic must return them unchanged.
const topicIdentifiers: Record<keyof typeof mqttTopics, Readonly<Record<string, string>>> = {
  laneHardwareState: { laneId },
  laneHardwareShot: { laneId },
  laneHardwareObservation: { laneId },
  laneSafetyState: { laneId },
  laneRangeOfficerRequest: { laneId },
  laneQualificationMalfunctionSignal: { laneId },
  laneEstComplaintSignal: { laneId },
  laneCommand: { laneId, action },
  laneCommandAcknowledgement: { laneId, action },
  competitionState: { competitionId },
  competitionCue: { competitionId },
  laneCompetitionState: { competitionId, laneId },
  laneAssignment: { competitionId, laneId },
  laneScore: { competitionId, laneId },
  competitionShot: { competitionId, laneId },
  competitionShotObservation: { competitionId, laneId },
  timedTargetState: { competitionId, laneId },
  competitionShootOffShot: { competitionId, laneId },
  qualificationRecoveryState: { competitionId, laneId },
  qualificationRecoveryShot: { competitionId, laneId },
  competitionCommand: { competitionId, action },
  competitionCommandAcknowledgement: { competitionId, action, laneId },
  laneCompetitionCommand: { competitionId, laneId, action },
  laneCompetitionCommandAcknowledgement: { competitionId, laneId, action },
  laneQueryRequest: { competitionId, laneId, requestId },
  laneQueryResponse: { competitionId, laneId, requestId },
};

describe('MQTT topic grammar', () => {
  it.each(Object.entries(goldenTopics))('builds the released %s topic', (_kind, [built, wire]) => {
    expect(built).toBe(wire);
  });

  it.each(Object.entries(goldenFilters))('builds the released %s subscription filter', (_name, [built, wire]) => {
    expect(built).toBe(wire);
  });

  it('builds the Director lane-wide subscriptions from topic builders and wildcards', () => {
    expect([
      mqttTopics.laneSafetyState(any),
      mqttTopics.laneRangeOfficerRequest(any),
      mqttTopics.laneQualificationMalfunctionSignal(any),
      mqttTopics.laneEstComplaintSignal(any),
      mqttTopics.laneCommandAcknowledgement(any, any),
    ]).toEqual([
      'saika/lane/+/safety/state',
      'saika/lane/+/range-officer/request',
      'saika/lane/+/qualification-malfunction/signal',
      'saika/lane/+/est-complaint/signal',
      'saika/lane/+/command/+/acknowledgement',
    ]);
  });

  it.each(Object.entries(goldenTopics))('parses the %s topic back to its kind and identifiers', (kind, [, wire]) => {
    expect(parseMqttTopic(wire)).toEqual({ kind, ...topicIdentifiers[kind as keyof typeof mqttTopics] });
  });

  it('names every parsed kind after its topic builder', () => {
    expectTypeOf<ParsedMqttTopic['kind']>().toEqualTypeOf<keyof typeof mqttTopics>();
  });

  it('keeps empty identifiers so receivers can apply their own identity checks', () => {
    expect(parseMqttTopic('saika/lane//command/')).toEqual({ kind: 'laneCommand', laneId: '', action: '' });
    expect(parseMqttTopic('saika/competition//lane//state')).toEqual({
      kind: 'laneCompetitionState',
      competitionId: '',
      laneId: '',
    });
    expect(parseMqttTopic('saika/competition/c/command/a/acknowledgement/')).toEqual({
      kind: 'competitionCommandAcknowledgement',
      competitionId: 'c',
      action: 'a',
      laneId: '',
    });
  });

  it.each([
    '',
    'saika',
    'saika/lane/lane-id',
    'other/lane/lane-id/hardware/state',
    'saika/vista/lane-id/hardware/state',
    'saika/lane/lane-id/hardware',
    'saika/lane/lane-id/hardware/state/extra',
    'saika/lane/lane-id/hardware/unknown',
    'saika/lane/lane-id/state',
    'saika/lane/lane-id/command',
    'saika/lane/lane-id/command/action/acknowledgement/extra',
    'saika/lane/lane-id/command/action/other',
    'saika/lane/lane-id/constructor/toString',
    'saika/competition/competition-id',
    'saika/competition/competition-id/unknown',
    'saika/competition/competition-id/toString',
    'saika/competition/competition-id/state/extra',
    'saika/competition/competition-id/command',
    'saika/competition/competition-id/command/action/acknowledgement',
    'saika/competition/competition-id/command/action/other/lane-id',
    'saika/competition/competition-id/lane/lane-id',
    'saika/competition/competition-id/lane/lane-id/cue',
    'saika/competition/competition-id/lane/lane-id/timed-target/shot',
    'saika/competition/competition-id/lane/lane-id/state/extra/more',
    'saika/competition/competition-id/lane/lane-id/command',
    'saika/competition/competition-id/lane/lane-id/command/action/other',
    'saika/competition/competition-id/lane/lane-id/query/request-id',
    'saika/competition/competition-id/lane/lane-id/query/request-id/other',
    'saika/competition/competition-id/lane/lane-id/query/request-id/request/extra',
  ])('does not classify %j', (topic) => {
    expect(parseMqttTopic(topic)).toBeNull();
  });
});
