import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type { EventForwardingRule, TransformerForwardingRule } from './EventForwardingRule';
import { Logger } from '@/shared/logging';

const logger = Logger.create('DomainEventForwarder');

/**
 * Checks whether a rule is a TransformerForwardingRule.
 */
function isTransformerRule(rule: EventForwardingRule | TransformerForwardingRule): rule is TransformerForwardingRule {
  return 'transformer' in rule;
}

/**
 * Data-driven domain event forwarding.
 *
 * Forwards domain events to IPC channels using rules collected from each module.
 *
 * Keeps forwarding declarations in their owning modules instead of a hard-coded central mapping.
 */
export class DomainEventForwarder {
  private unsubscribers: (() => void)[] = [];
  private started = false;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly windowManager: WindowManager,
    private readonly rules: (EventForwardingRule | TransformerForwardingRule)[],
  ) {}

  start(): void {
    if (this.started) {
      logger.warn('Already started. Ignoring duplicate start() call.');
      return;
    }
    this.started = true;

    const send = (channel: string, data: unknown) => {
      this.windowManager.broadcast(channel, data);
    };

    for (const rule of this.rules) this.unsubscribers.push(this.subscribe(rule, send));
  }

  /** The bus delivers only events of the subscribed type, which is the type the rule's functions accept. */
  private subscribe(
    rule: EventForwardingRule | TransformerForwardingRule,
    send: (channel: string, data: unknown) => void,
  ): () => void {
    if (isTransformerRule(rule)) {
      // Custom forwarding such as diff calculation.
      const forward = rule.transformer.forward.bind(rule.transformer) as (
        event: AnyDomainEvent,
        send: (channel: string, data: unknown) => void,
      ) => void;
      return this.eventBus.on(rule.eventType, (event) => forward(event, send));
    }
    // Simple payload extraction and broadcast.
    const extractPayload = rule.extractPayload.bind(rule) as (event: AnyDomainEvent) => unknown;
    return this.eventBus.on(rule.eventType, (event) => send(rule.channel, extractPayload(event)));
  }

  stop(): void {
    this.started = false;
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    // Run optional transformer cleanup.
    for (const rule of this.rules) {
      if (isTransformerRule(rule)) rule.transformer.cleanup?.();
    }
  }
}
