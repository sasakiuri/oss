import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('AppLifecycle');

interface LifecycleService {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Application lifecycle manager.
 *
 * - startAll() fails fast.
 * - stopAll() logs failures and continues.
 * - Services stop in reverse registration order.
 */
export class AppLifecycle {
  private services: LifecycleService[] = [];

  register(service: LifecycleService): void {
    if (this.services.some((s) => s.name === service.name)) {
      throw new Error(`AppLifecycle: duplicate service name: "${service.name}"`);
    }
    this.services.push(service);
  }

  registerShutdownOnly(name: string, stopFn: () => Promise<void> | void): void {
    this.register({
      name,
      start: async () => {},
      stop: async () => {
        await stopFn();
      },
    });
  }

  async startAll(): Promise<void> {
    const started: LifecycleService[] = [];
    try {
      for (const service of this.services) {
        logger.info(`Starting ${service.name}...`);
        await service.start();
        logger.info(`${service.name} started`);
        started.push(service);
      }
    } catch (err) {
      logger.logError('Startup failed, rolling back started services...', err);
      for (const service of [...started].reverse()) {
        try {
          logger.info(`Rolling back ${service.name}...`);
          await service.stop();
          logger.info(`${service.name} rolled back`);
        } catch (stopErr) {
          logger.logError(`Failed to roll back ${service.name}`, stopErr);
        }
      }
      throw err;
    }
  }

  async stopAll(): Promise<void> {
    const reversed = [...this.services].reverse();
    for (const service of reversed) {
      try {
        logger.info(`Stopping ${service.name}...`);
        await service.stop();
        logger.info(`${service.name} stopped`);
      } catch (err) {
        logger.logError(`Failed to stop ${service.name}`, err);
      }
    }
  }
}
