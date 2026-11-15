// SPDX-License-Identifier: MIT

/** Topics that carry exactly one message family; each builder name is also its parsed `kind`. */
export const mqttTopics = {
  laneHardwareState: (laneId: string) => `saika/lane/${laneId}/hardware/state`,
  laneHardwareShot: (laneId: string) => `saika/lane/${laneId}/hardware/shot`,
  /** Shot observation evidence recorded while the Lane is not in a competition. */
  laneHardwareObservation: (laneId: string) => `saika/lane/${laneId}/hardware/observation`,
  laneSafetyState: (laneId: string) => `saika/lane/${laneId}/safety/state`,
  laneRangeOfficerRequest: (laneId: string) => `saika/lane/${laneId}/range-officer/request`,
  laneQualificationMalfunctionSignal: (laneId: string) => `saika/lane/${laneId}/qualification-malfunction/signal`,
  laneEstComplaintSignal: (laneId: string) => `saika/lane/${laneId}/est-complaint/signal`,
  laneCommand: (laneId: string, action: string) => `saika/lane/${laneId}/command/${action}`,
  laneCommandAcknowledgement: (laneId: string, action: string) =>
    `saika/lane/${laneId}/command/${action}/acknowledgement`,
  competitionState: (competitionId: string) => `saika/competition/${competitionId}/state`,
  competitionCue: (competitionId: string) => `saika/competition/${competitionId}/cue`,
  laneCompetitionState: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/state`,
  laneAssignment: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/assignment`,
  laneScore: (competitionId: string, laneId: string) => `saika/competition/${competitionId}/lane/${laneId}/score`,
  competitionShot: (competitionId: string, laneId: string) => `saika/competition/${competitionId}/lane/${laneId}/shot`,
  /** Shot observation evidence recorded while the Lane is in a competition. */
  competitionShotObservation: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/observation`,
  timedTargetState: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/timed-target/state`,
  competitionShootOffShot: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/shoot-off/shot`,
  qualificationRecoveryState: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/qualification-recovery/state`,
  qualificationRecoveryShot: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/qualification-recovery/shot`,
  competitionCommand: (competitionId: string, action: string) => `saika/competition/${competitionId}/command/${action}`,
  competitionCommandAcknowledgement: (competitionId: string, action: string, laneId: string) =>
    `saika/competition/${competitionId}/command/${action}/acknowledgement/${laneId}`,
  laneCompetitionCommand: (competitionId: string, laneId: string, action: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/command/${action}`,
  laneCompetitionCommandAcknowledgement: (competitionId: string, laneId: string, action: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/command/${action}/acknowledgement`,
  laneQueryRequest: (competitionId: string, laneId: string, requestId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/query/${requestId}/request`,
  laneQueryResponse: (competitionId: string, laneId: string, requestId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/query/${requestId}/response`,
} as const;

/** MQTT single-level wildcard; pass it as an identifier to a topic builder to match every value. */
export const MQTT_SINGLE_LEVEL_WILDCARD = '+';

/** Subscription filters that use wildcards in the trailing levels. */
export const mqttTopicFilters = {
  laneCommands: (laneId: string) => mqttTopics.laneCommand(laneId, MQTT_SINGLE_LEVEL_WILDCARD),
  laneHardware: (laneId: string) => `saika/lane/${laneId}/hardware/#`,
  competition: (competitionId: string) => `saika/competition/${competitionId}/#`,
  competitionCommands: (competitionId: string) =>
    mqttTopics.competitionCommand(competitionId, MQTT_SINGLE_LEVEL_WILDCARD),
  laneCompetitionCommands: (competitionId: string, laneId: string) =>
    mqttTopics.laneCompetitionCommand(competitionId, laneId, MQTT_SINGLE_LEVEL_WILDCARD),
  laneQueryRequests: (competitionId: string, laneId: string) =>
    mqttTopics.laneQueryRequest(competitionId, laneId, MQTT_SINGLE_LEVEL_WILDCARD),
} as const;

type LaneTopicKind =
  | 'laneHardwareState'
  | 'laneHardwareShot'
  | 'laneHardwareObservation'
  | 'laneSafetyState'
  | 'laneRangeOfficerRequest'
  | 'laneQualificationMalfunctionSignal'
  | 'laneEstComplaintSignal';
type CompetitionTopicKind = 'competitionState' | 'competitionCue';
type CompetitionLaneTopicKind =
  | 'laneCompetitionState'
  | 'laneAssignment'
  | 'laneScore'
  | 'competitionShot'
  | 'competitionShotObservation'
  | 'timedTargetState'
  | 'competitionShootOffShot'
  | 'qualificationRecoveryState'
  | 'qualificationRecoveryShot';

/**
 * A received topic split into its kind and identifiers. Parsing checks the topic structure only: identifiers are
 * returned exactly as received, including empty strings, so receivers keep their own identity checks.
 */
export type ParsedMqttTopic =
  | { readonly kind: LaneTopicKind; readonly laneId: string }
  | { readonly kind: 'laneCommand' | 'laneCommandAcknowledgement'; readonly laneId: string; readonly action: string }
  | { readonly kind: CompetitionTopicKind; readonly competitionId: string }
  | { readonly kind: 'competitionCommand'; readonly competitionId: string; readonly action: string }
  | {
      readonly kind: 'competitionCommandAcknowledgement';
      readonly competitionId: string;
      readonly action: string;
      readonly laneId: string;
    }
  | { readonly kind: CompetitionLaneTopicKind; readonly competitionId: string; readonly laneId: string }
  | {
      readonly kind: 'laneCompetitionCommand' | 'laneCompetitionCommandAcknowledgement';
      readonly competitionId: string;
      readonly laneId: string;
      readonly action: string;
    }
  | {
      readonly kind: 'laneQueryRequest' | 'laneQueryResponse';
      readonly competitionId: string;
      readonly laneId: string;
      readonly requestId: string;
    };

const LANE_TOPIC_KINDS: Readonly<Record<string, LaneTopicKind>> = {
  'hardware/state': 'laneHardwareState',
  'hardware/shot': 'laneHardwareShot',
  'hardware/observation': 'laneHardwareObservation',
  'safety/state': 'laneSafetyState',
  'range-officer/request': 'laneRangeOfficerRequest',
  'qualification-malfunction/signal': 'laneQualificationMalfunctionSignal',
  'est-complaint/signal': 'laneEstComplaintSignal',
};

const COMPETITION_TOPIC_KINDS: Readonly<Record<string, CompetitionTopicKind>> = {
  state: 'competitionState',
  cue: 'competitionCue',
};

const COMPETITION_LANE_TOPIC_KINDS: Readonly<Record<string, CompetitionLaneTopicKind>> = {
  state: 'laneCompetitionState',
  assignment: 'laneAssignment',
  score: 'laneScore',
  shot: 'competitionShot',
  observation: 'competitionShotObservation',
  'timed-target/state': 'timedTargetState',
  'shoot-off/shot': 'competitionShootOffShot',
  'qualification-recovery/state': 'qualificationRecoveryState',
  'qualification-recovery/shot': 'qualificationRecoveryShot',
};

/** Returns the kind and identifiers of a topic built by `mqttTopics`, or null for any other topic. */
export function parseMqttTopic(topic: string): ParsedMqttTopic | null {
  const segments = topic.split('/');
  if (segments[0] !== 'saika' || segments.length < 4) return null;
  const [, scope, id = '', ...rest] = segments;
  if (scope === 'lane') return parseLaneTopic(id, rest);
  if (scope === 'competition') return parseCompetitionTopic(id, rest);
  return null;
}

function parseLaneTopic(laneId: string, rest: string[]): ParsedMqttTopic | null {
  if (rest[0] === 'command') {
    const action = rest[1] ?? '';
    if (rest.length === 2) return { kind: 'laneCommand', laneId, action };
    if (rest.length === 3 && rest[2] === 'acknowledgement')
      return { kind: 'laneCommandAcknowledgement', laneId, action };
    return null;
  }
  const kind = rest.length === 2 ? ownValue(LANE_TOPIC_KINDS, rest.join('/')) : undefined;
  return kind ? { kind, laneId } : null;
}

function parseCompetitionTopic(competitionId: string, rest: string[]): ParsedMqttTopic | null {
  if (rest[0] === 'lane') return parseCompetitionLaneTopic(competitionId, rest[1] ?? '', rest.slice(2));
  if (rest[0] === 'command') {
    const action = rest[1] ?? '';
    if (rest.length === 2) return { kind: 'competitionCommand', competitionId, action };
    if (rest.length === 4 && rest[2] === 'acknowledgement') {
      return { kind: 'competitionCommandAcknowledgement', competitionId, action, laneId: rest[3] ?? '' };
    }
    return null;
  }
  const kind = rest.length === 1 ? ownValue(COMPETITION_TOPIC_KINDS, rest[0] ?? '') : undefined;
  return kind ? { kind, competitionId } : null;
}

function parseCompetitionLaneTopic(competitionId: string, laneId: string, rest: string[]): ParsedMqttTopic | null {
  if (rest[0] === 'command') {
    const action = rest[1] ?? '';
    if (rest.length === 2) return { kind: 'laneCompetitionCommand', competitionId, laneId, action };
    if (rest.length === 3 && rest[2] === 'acknowledgement') {
      return { kind: 'laneCompetitionCommandAcknowledgement', competitionId, laneId, action };
    }
    return null;
  }
  if (rest[0] === 'query' && rest.length === 3) {
    const requestId = rest[1] ?? '';
    if (rest[2] === 'request') return { kind: 'laneQueryRequest', competitionId, laneId, requestId };
    if (rest[2] === 'response') return { kind: 'laneQueryResponse', competitionId, laneId, requestId };
    return null;
  }
  const kind =
    rest.length === 1 || rest.length === 2 ? ownValue(COMPETITION_LANE_TOPIC_KINDS, rest.join('/')) : undefined;
  return kind ? { kind, competitionId, laneId } : null;
}

function ownValue<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
