import { timingSafeEqual } from 'node:crypto';

export type MqttPrincipalRole = 'DIRECTOR' | 'LANE';

export interface EmbeddedMqttAccount {
  readonly username: string;
  readonly password: string;
  readonly role: MqttPrincipalRole;
}

export type EmbeddedMqttSecurityConfig =
  { readonly mode: 'DISABLED' } | { readonly mode: 'REQUIRED'; readonly accounts: readonly EmbeddedMqttAccount[] };

export interface MqttPrincipal {
  readonly username: string;
  readonly role: MqttPrincipalRole;
}

/** Pure authentication and topic-authorization policy for the embedded broker. */
export class EmbeddedMqttAccessPolicy {
  constructor(private readonly config: EmbeddedMqttSecurityConfig) {
    if (config.mode === 'REQUIRED') {
      if (config.accounts.length === 0) throw new Error('Required MQTT authentication needs at least one account');
      if (new Set(config.accounts.map((account) => account.username)).size !== config.accounts.length) {
        throw new Error('MQTT account usernames must be unique');
      }
    }
  }

  get enabled(): boolean {
    return this.config.mode === 'REQUIRED';
  }

  authenticate(username: string | undefined, password: Buffer | undefined): MqttPrincipal | null {
    if (this.config.mode === 'DISABLED') return { username: 'anonymous', role: 'DIRECTOR' };
    if (!username || !password) return null;
    const account = this.config.accounts.find((candidate) => candidate.username === username);
    if (!account || !safeEqual(password, Buffer.from(account.password, 'utf8'))) return null;
    return { username: account.username, role: account.role };
  }

  canPublish(principal: MqttPrincipal, clientId: string, topic: string): boolean {
    if (!topic.startsWith('saika/')) return false;
    if (principal.role === 'DIRECTOR') return true;
    const laneId = laneIdFromClientId(clientId);
    if (!laneId) return false;
    const parts = topic.split('/');
    if (parts[1] === 'lane' && parts[2] === laneId) {
      return parts[3] !== 'command' || parts.at(-1) === 'acknowledgement';
    }
    if (parts[1] !== 'competition') return false;
    if (parts[3] === 'command') {
      return parts[5] === 'acknowledgement' && parts[6] === laneId;
    }
    if (parts[3] === 'lane' && parts[4] === laneId) {
      return parts[5] !== 'command' || parts.at(-1) === 'acknowledgement';
    }
    return false;
  }

  canSubscribe(principal: MqttPrincipal, clientId: string, topic: string): boolean {
    if (principal.role === 'DIRECTOR') return topic.startsWith('saika/');
    const laneId = laneIdFromClientId(clientId);
    if (!laneId) return false;
    if (topic === `saika/lane/${laneId}/command/+`) return true;

    const parts = topic.split('/');
    if (parts[0] !== 'saika' || parts[1] !== 'competition' || !parts[2]) return false;
    if (parts.length === 4) return parts[3] === 'state' || parts[3] === 'cue';
    if (parts.length === 5) return parts[3] === 'command' && parts[4] === '+';
    if (parts[3] !== 'lane' || parts[4] !== laneId) return false;
    return (
      (parts.length === 7 && parts[5] === 'command' && parts[6] === '+') ||
      (parts.length === 8 && parts[5] === 'query' && parts[6] === '+' && parts[7] === 'request')
    );
  }
}

export function embeddedMqttSecurityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): EmbeddedMqttSecurityConfig {
  const configuredMode = environment.SAIKA_MQTT_BROKER_AUTH_MODE?.trim().toUpperCase();
  if (!configuredMode || configuredMode === 'DISABLED') return { mode: 'DISABLED' };
  if (configuredMode !== 'REQUIRED') {
    throw new Error('SAIKA_MQTT_BROKER_AUTH_MODE must be DISABLED or REQUIRED');
  }
  const accounts = [
    account(environment, 'DIRECTOR', 'SAIKA_MQTT_DIRECTOR_USERNAME', 'SAIKA_MQTT_DIRECTOR_PASSWORD'),
    account(environment, 'LANE', 'SAIKA_MQTT_LANE_USERNAME', 'SAIKA_MQTT_LANE_PASSWORD'),
  ];
  return { mode: 'REQUIRED', accounts };
}

function account(
  environment: Readonly<Record<string, string | undefined>>,
  role: MqttPrincipalRole,
  usernameKey: string,
  passwordKey: string,
): EmbeddedMqttAccount {
  const username = environment[usernameKey]?.trim();
  const password = environment[passwordKey];
  if (!username || !password) throw new Error(`Required MQTT authentication is missing ${usernameKey}/${passwordKey}`);
  return { username, password, role };
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function laneIdFromClientId(clientId: string): string | null {
  const match = /^saika-lane-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(
    clientId,
  );
  return match?.[1] ?? null;
}
