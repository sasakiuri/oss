// SPDX-License-Identifier: MIT
import { defineQuery } from '@/main/shared-infra/cqrs/QueryBus';

import type { Event } from '../domain/Event';

// Cross-module queries answered by the championship module (board, results and other modules).

export interface GetEventByIdQuery {
  eventId: string;
}

export interface GetEventByIdResponse {
  id: string;
  name: string;
  eventType: string;
  round: string;
  sortOrder: number;
  rulePackIdentity: Event['rulePackIdentity'];
}

export const GetEventByIdToken = defineQuery<GetEventByIdQuery, GetEventByIdResponse | null>('GetEventById');

export interface GetFiringPointAssignmentsByRelayQuery {
  eventId: string;
  relayNumber: number;
}

export interface RelayFiringPointAssignment {
  firingPointNumber: number;
  participantId: string;
  playerName: string;
  familyName: string;
  affiliation: string;
}

export const GetFiringPointAssignmentsByRelayToken = defineQuery<
  GetFiringPointAssignmentsByRelayQuery,
  RelayFiringPointAssignment[]
>('GetFiringPointAssignmentsByRelay');
