// SPDX-License-Identifier: MIT
/** Modules extend EventRegistry through declaration merging to type their events. */

/** Event registry - extended via declare module */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventRegistry {}

/** Base event shape — saika.lane requires aggregateId for ID capture */
export interface DomainEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly aggregateId: string;
}

/** Union of all registered events */
export type AnyDomainEvent = EventRegistry[keyof EventRegistry];

export type EventName = keyof EventRegistry & string;

/** Mapped type for event name → event type lookup */
export type EventMap = {
  [E in AnyDomainEvent as E['type']]: E;
};
