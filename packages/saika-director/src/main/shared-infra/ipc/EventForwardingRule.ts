import type { AnyDomainEvent } from '../events/EventBus';

/**
 * Event forwarding rule.
 *
 * Modules declare how domain events map to IPC channels; DomainEventForwarder processes them together.
 */
export interface EventForwardingRule {
  readonly eventType: string;
  readonly channel: string;
  extractPayload(event: AnyDomainEvent): unknown;
}

/**
 * Custom event transformer.
 *
 * Handles forwarding logic, such as diff calculation, that simple payload extraction cannot express.
 */
export interface EventTransformer {
  forward(event: AnyDomainEvent, send: (ch: string, data: unknown) => void): void;
}

/**
 * Extended event forwarding rule.
 *
 * Rules with an EventTransformer use transformer.forward() instead of extractPayload.
 */
export interface TransformerForwardingRule {
  readonly eventType: string;
  readonly transformer: EventTransformer;
}
