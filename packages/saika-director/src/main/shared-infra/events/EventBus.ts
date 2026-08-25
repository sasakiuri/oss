/**
 * EventBus Registry
 *
 * Modules extend EventRegistry through declaration merging to provide type-safe event publishing and subscription.
 */

/** Event registry - extended by each module via declare module */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventRegistry {}

/** Base event shape */
export interface DomainEvent {
  readonly type: string;
  readonly timestamp: number;
}

/** Union of all registered events */
export type AnyDomainEvent = EventRegistry[keyof EventRegistry];

export type EventName = keyof EventRegistry & string;

/** Mapped type for event name → event type lookup */
export type EventMap = {
  [E in AnyDomainEvent as E['type']]: E;
};
