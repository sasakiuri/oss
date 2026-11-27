// SPDX-License-Identifier: MIT
import {
  commandSchemasForScope,
  MQTT_COMMAND_SCHEMAS,
  type MqttCommandActionOf,
} from '@sasakiuri/saika-protocol/commands';
import type { CompetitionPhase } from '@sasakiuri/saika-protocol/CompetitionState';
import type { z } from 'zod';

import type { FiringBoundarySignal, FiringCommandPhase } from '../domain/IFiringWindowJournal';

/** Competition commands that every joined Lane receives and that move the competition timer or phase. */
export type CompetitionBroadcastAction = Extract<
  MqttCommandActionOf<'competition'>,
  | 'start-sighting'
  | 'end-sighting'
  | 'start-match'
  | 'timer-started'
  | 'timer-expired'
  | 'advance-series'
  | 'finish-competition'
>;

const competitionCommandSchemas = commandSchemasForScope(MQTT_COMMAND_SCHEMAS, 'competition');

type CompetitionBroadcast<Action extends CompetitionBroadcastAction> = z.output<
  (typeof competitionCommandSchemas)[Action]
>;

/** The action's own payload fields; the command port adds the command identity. */
export type CompetitionBroadcastFields<Action extends CompetitionBroadcastAction> = Omit<
  z.input<(typeof competitionCommandSchemas)[Action]>,
  'commandId' | 'issuedBy' | 'issuerId' | 'issuedAt'
>;

const broadcastSchemas: {
  readonly [Action in CompetitionBroadcastAction]: { parse(value: unknown): CompetitionBroadcast<Action> };
} = competitionCommandSchemas;

type FiringBoundaryChange = Pick<FiringBoundarySignal, 'sourceAction' | 'phase' | 'transition' | 'occurredAt'>;

const isFiringPhase = (phase: CompetitionPhase): phase is FiringCommandPhase =>
  phase === 'SIGHTING' || phase === 'MATCH';

const change = (
  sourceAction: FiringBoundaryChange['sourceAction'],
  phase: FiringCommandPhase,
  transition: FiringBoundaryChange['transition'],
  occurredAt: string,
): FiringBoundaryChange => ({ sourceAction, phase, transition, occurredAt: new Date(occurredAt) });

/** Whether a broadcast opens or closes firing, given the competition phase when it is sent. */
const firingBoundaryChanges: {
  readonly [Action in CompetitionBroadcastAction]: (
    command: CompetitionBroadcast<Action>,
    phase: CompetitionPhase,
  ) => FiringBoundaryChange | null;
} = {
  'start-sighting': (command) => change('start-sighting', 'SIGHTING', 'OPEN', command.timerStartAt),
  'end-sighting': (command) => change('end-sighting', 'SIGHTING', 'CLOSE', command.issuedAt),
  // Without a generic timer, MATCH only arms the phase; the target program opens firing later.
  'start-match': (command) =>
    command.timerDurationSeconds === undefined ? null : change('start-match', 'MATCH', 'OPEN', command.timerStartAt),
  'timer-started': (command, phase) =>
    isFiringPhase(phase) ? change('timer-started', phase, 'OPEN', command.timerStartAt) : null,
  'timer-expired': (command, phase) =>
    isFiringPhase(phase) ? change('timer-expired', phase, 'CLOSE', command.expiredAt) : null,
  'advance-series': () => null,
  'finish-competition': (command, phase) =>
    phase === 'MATCH' ? change('finish-competition', 'MATCH', 'CLOSE', command.issuedAt) : null,
};

/** Validates a broadcast and derives the firing boundary it records once the broker accepts it. */
export function prepareCompetitionBroadcast<Action extends CompetitionBroadcastAction>(
  competitionId: string,
  phase: CompetitionPhase,
  action: Action,
  payload: unknown,
): { command: CompetitionBroadcast<Action>; firingBoundary: FiringBoundarySignal | null } {
  const command = broadcastSchemas[action].parse(payload);
  const boundaryChange = firingBoundaryChanges[action](command, phase);
  return {
    command,
    firingBoundary: boundaryChange && {
      ...boundaryChange,
      competitionId,
      commandId: command.commandId,
      commandIssuedAt: new Date(command.issuedAt),
    },
  };
}
