// SPDX-License-Identifier: MIT

export interface EventSummary {
  readonly name: string;
  readonly eventType: string;
}

/** Reads an event's name and competition type as stored, without building the Event aggregate. */
export interface IEventSummaryReader {
  findSummary(eventId: string): EventSummary | undefined;
}
