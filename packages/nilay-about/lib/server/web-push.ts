import 'server-only';

import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

/**
 * Web Push without a library: message encryption (RFC 8291, `aes128gcm` from RFC 8188) and VAPID
 * (RFC 8292). Node's crypto has every primitive it needs, and the whole protocol fits here.
 */

export interface PushSubscriptionKeys {
  /** The user agent's P-256 public key, uncompressed, base64url. */
  p256dh: string;
  /** The 16-byte authentication secret, base64url. */
  auth: string;
}

export interface PushTarget {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes), base64url. */
  publicKey: string;
  /** The private scalar (32 bytes), base64url. */
  privateKey: string;
  /** A `mailto:` or `https:` contact for the push service operator. */
  subject: string;
}

const RECORD_SIZE = 4096;
// One record: the header (86 bytes) and the 16-byte tag leave this much for the message.
export const MAX_PAYLOAD_BYTES = RECORD_SIZE - 86 - 16 - 1;

/**
 * Push services this server will send to. The endpoint comes from the browser, so without this
 * list the server could be made to POST to any address (SSRF).
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname))
  );
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

function decodeKey(value: string, length: number, name: string): Buffer {
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== length) throw new Error(`${name} must be ${length} bytes`);
  return bytes;
}

export interface EncryptionInputs {
  /** Random 16 bytes in use; fixed only by tests against the RFC's example. */
  salt?: Buffer;
  /** The application server's one-time key pair; fixed only by tests. */
  serverPrivateKey?: Buffer;
}

/** The `aes128gcm` body of one push message (RFC 8291 §3–4). */
export function encryptPayload(plaintext: Buffer, keys: PushSubscriptionKeys, inputs: EncryptionInputs = {}): Buffer {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new Error('Push payload is too large');
  const uaPublic = decodeKey(keys.p256dh, 65, 'p256dh');
  const authSecret = decodeKey(keys.auth, 16, 'auth');
  if (uaPublic[0] !== 0x04) throw new Error('p256dh must be an uncompressed point');

  const ecdh = createECDH('prime256v1');
  if (inputs.serverPrivateKey) ecdh.setPrivateKey(inputs.serverPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));

  const salt = inputs.salt ?? randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 marks the last (and only) record, with no padding.
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.update(Buffer.from([2])), cipher.final()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ciphertext, cipher.getAuthTag()]);
}

export class VapidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VapidConfigError';
  }
}

/** True when `p256dh` is an uncompressed point on P-256 that a key agreement accepts. */
export function isValidUserAgentKey(p256dh: string): boolean {
  const point = Buffer.from(p256dh, 'base64url');
  if (point.length !== 65 || point[0] !== 0x04) return false;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    ecdh.computeSecret(point);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks that the configured VAPID public key belongs to the private key. A mismatch would make
 * every push fail with 401/403 while looking configured, so it stops the server at start instead.
 */
export function assertVapidKeyPair(publicKey: string, privateKey: string): void {
  const ecdh = createECDH('prime256v1');
  try {
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
  } catch {
    throw new VapidConfigError('VAPID_PRIVATE_KEY is not a valid P-256 private key');
  }
  if (ecdh.getPublicKey().toString('base64url') !== publicKey) {
    throw new VapidConfigError('VAPID_PUBLIC_KEY does not belong to VAPID_PRIVATE_KEY');
  }
}

function vapidPrivateKey(keys: VapidKeys): KeyObject {
  const publicKey = decodeKey(keys.publicKey, 65, 'VAPID public key');
  const d = decodeKey(keys.privateKey, 32, 'VAPID private key');
  return createPrivateKey({
    format: 'jwk',
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: d.toString('base64url'),
      x: publicKey.subarray(1, 33).toString('base64url'),
      y: publicKey.subarray(33, 65).toString('base64url'),
    },
  });
}

/** The `Authorization` header value for one push service (RFC 8292 §3). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowMs: number): string {
  const audience = new URL(endpoint).origin;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  // 12 hours; the RFC allows up to 24.
  const claims = { aud: audience, exp: Math.floor(nowMs / 1000) + 12 * 60 * 60, sub: keys.subject };
  const unsigned = `${encode({ typ: 'JWT', alg: 'ES256' })}.${encode(claims)}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: vapidPrivateKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${signature.toString('base64url')}, k=${keys.publicKey}`;
}

export interface PushMessage {
  title: string;
  body: string;
  /** A same-origin path opened when the notification is clicked. */
  url: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
}

export type PushOutcome = 'sent' | 'gone' | 'failed';

/**
 * How long a push service may take to accept a message, unless the caller gives a time of its own
 * (the return check gives less, to fit its run). A healthy service answers in well under a second.
 */
export const PUSH_TIMEOUT_MS = 10_000;

export interface PushSenderOptions {
  vapid: () => VapidKeys | null;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export type SendPush = (
  target: PushTarget,
  message: PushMessage,
  options: { ttlSeconds: number; urgency: 'normal' | 'high'; timeoutMs?: number },
) => Promise<PushOutcome>;

/**
 * `gone` means the push service no longer knows the subscription (404/410) and the caller should
 * delete it. Anything else that is not a 2xx is `failed`; nothing is retried here.
 */
export function createPushSender(options: PushSenderOptions): SendPush {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  return async (target, message, { ttlSeconds, urgency, timeoutMs }) => {
    const vapid = options.vapid();
    if (!vapid) throw new VapidConfigError('VAPID keys are not configured');
    if (!isAllowedPushEndpoint(target.endpoint)) return 'gone';
    let body: Buffer;
    try {
      body = encryptPayload(Buffer.from(JSON.stringify(message)), target.keys);
    } catch {
      // A subscription whose keys cannot be used will never work: it is treated as gone and deleted.
      return 'gone';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? options.timeoutMs ?? PUSH_TIMEOUT_MS);
    try {
      const response = await doFetch(target.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidAuthorization(target.endpoint, vapid, now()),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          TTL: String(ttlSeconds),
          Urgency: urgency,
        },
        body: new Uint8Array(body),
        redirect: 'error',
        signal: controller.signal,
      });
      if (response.ok) return 'sent';
      return response.status === 404 || response.status === 410 ? 'gone' : 'failed';
    } catch {
      return 'failed';
    } finally {
      clearTimeout(timer);
    }
  };
}
