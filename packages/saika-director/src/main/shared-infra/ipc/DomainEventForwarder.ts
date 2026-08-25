import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import type { EventForwardingRule, TransformerForwardingRule } from './EventForwardingRule';
import { Logger } from '@/shared/utils/Logger';

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

    for (const rule of this.rules) {
      if (isTransformerRule(rule)) {
        // TransformerForwardingRule: custom forwarding such as diff calculation.
        this.unsubscribers.push(
          this.eventBus.on(rule.eventType, (event: AnyDomainEvent) => {
            rule.transformer.forward(event, send);
          }),
        );
      } else {
        // EventForwardingRule: simple payload extraction and broadcast.
        this.unsubscribers.push(
          this.eventBus.on(rule.eventType, (event: AnyDomainEvent) => {
            send(rule.channel, rule.extractPayload(event));
          }),
        );
      }
    }
  }

  stop(): void {
    this.started = false;
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];

    // Run optional transformer cleanup.
    for (const rule of this.rules) {
      if (isTransformerRule(rule) && 'cleanup' in rule.transformer) {
        (rule.transformer as { cleanup(): void }).cleanup();
      }
    }
  }
}
