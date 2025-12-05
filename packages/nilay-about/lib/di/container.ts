/**
 * Simple Dependency Injection Container
 * Allows for easy mocking in tests and runtime configuration changes
 */

type Factory<T> = () => T;
type AsyncFactory<T> = () => Promise<T>;

interface ServiceRegistration<T> {
  factory: Factory<T> | AsyncFactory<T>;
  singleton: boolean;
  instance?: T;
}

class DIContainer {
  private services = new Map<string, ServiceRegistration<unknown>>();

  /**
   * Register a service factory
   */
  register<T>(
    key: string,
    factory: Factory<T>,
    options: { singleton?: boolean } = {}
  ): void {
    this.services.set(key, {
      factory,
      singleton: options.singleton ?? true,
    });
  }

  /**
   * Register an async service factory
   */
  registerAsync<T>(
    key: string,
    factory: AsyncFactory<T>,
    options: { singleton?: boolean } = {}
  ): void {
    this.services.set(key, {
      factory,
      singleton: options.singleton ?? true,
    });
  }

  /**
   * Get a service instance
   */
  get<T>(key: string): T {
    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`Service "${key}" not registered`);
    }

    if (registration.singleton && registration.instance !== undefined) {
      return registration.instance as T;
    }

    const instance = (registration.factory as Factory<T>)();

    if (registration.singleton) {
      registration.instance = instance;
    }

    return instance;
  }

  /**
   * Get a service instance asynchronously
   */
  async getAsync<T>(key: string): Promise<T> {
    const registration = this.services.get(key);
    if (!registration) {
      throw new Error(`Service "${key}" not registered`);
    }

    if (registration.singleton && registration.instance !== undefined) {
      return registration.instance as T;
    }

    const instance = await (registration.factory as AsyncFactory<T>)();

    if (registration.singleton) {
      registration.instance = instance;
    }

    return instance;
  }

  /**
   * Check if a service is registered
   */
  has(key: string): boolean {
    return this.services.has(key);
  }

  /**
   * Clear a specific service instance (useful for testing)
   */
  clearInstance(key: string): void {
    const registration = this.services.get(key);
    if (registration) {
      registration.instance = undefined;
    }
  }

  /**
   * Clear all service instances
   */
  clearAllInstances(): void {
    this.services.forEach((registration) => {
      registration.instance = undefined;
    });
  }

  /**
   * Override a service (useful for testing)
   */
  override<T>(key: string, instance: T): void {
    const registration = this.services.get(key);
    if (registration) {
      registration.instance = instance;
    } else {
      this.services.set(key, {
        factory: () => instance,
        singleton: true,
        instance,
      });
    }
  }
}

// Global container instance
export const container = new DIContainer();

// Service keys
export const ServiceKeys = {
  FIRESTORE: "firestore",
  FIREBASE_FUNCTIONS: "firebaseFunctions",
  FIREBASE_ANALYTICS: "firebaseAnalytics",
  NEWS_REPOSITORY: "newsRepository",
  CONTACT_SERVICE: "contactService",
} as const;

export type ServiceKey = (typeof ServiceKeys)[keyof typeof ServiceKeys];
