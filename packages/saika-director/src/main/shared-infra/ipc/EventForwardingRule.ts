import type { EventMap, EventName } from '../events/EventBus';

/** Forwards one domain event to one IPC channel; the event type follows from `eventType`. */
interface EventForwardingRuleFor<N extends EventName> {
  readonly eventType: N;
  readonly channel: string;
  extractPayload(event: EventMap[N]): unknown;
}

/** Forwarding that payload extraction cannot express, such as sending only the difference to the last event. */
export interface EventTransformer<N extends EventName = EventName> {
  forward(event: EventMap[N], send: (ch: string, data: unknown) => void): void;
  /** Drops state kept between events when forwarding stops. */
  cleanup?(): void;
}

interface TransformerForwardingRuleFor<N extends EventName> {
  readonly eventType: N;
  readonly transformer: EventTransformer<N>;
}

/**
 * Event forwarding rule.
 *
 * Modules declare how domain events map to IPC channels; DomainEventForwarder processes them together.
 */
export type EventForwardingRule = { [N in EventName]: EventForwardingRuleFor<N> }[EventName];

/** Rules with an EventTransformer use transformer.forward() instead of extractPayload. */
export type TransformerForwardingRule = { [N in EventName]: TransformerForwardingRuleFor<N> }[EventName];
