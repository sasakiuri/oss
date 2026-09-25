import {
  createDecipheriv,
  createECDH,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  verify,
} from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  assertVapidKeyPair,
  createPushSender,
  encryptPayload,
  isValidUserAgentKey,
  isAllowedPushEndpoint,
  MAX_PAYLOAD_BYTES,
  vapidAuthorization,
  type VapidKeys,
} from '@/lib/server/web-push';

const b64 = (value: string) => Buffer.from(value.replace(/\s+/g, ''), 'base64url');

// RFC 8291 Section 5 and Appendix A.
const rfc = {
  plaintext: b64('V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24'),
  asPrivate: b64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'),
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: b64('DGv6ra1nlYgDCS1FRnbzlw'),
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  header: b64(`DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
    mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8`),
  ciphertext: b64(`8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs
    bI_0LpXMuGvnzQ`),
};

function vapidKeys(): VapidKeys {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.concat([Buffer.from([4]), b64(jwk.x ?? ''), b64(jwk.y ?? '')]).toString('base64url');
  return { publicKey, privateKey: jwk.d ?? '', subject: 'mailto:labs@example.test' };
}

/** A user agent's side, to decrypt what the server sent. */
function userAgent() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const decrypt = (body: Buffer) => {
    const salt = body.subarray(0, 16);
    const idLength = body[20] ?? 0;
    const asPublic = body.subarray(21, 21 + idLength);
    const secret = ecdh.computeSecret(asPublic);
    const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
    const prkKey = hmac(auth, secret);
    const ikm = hmac(
      prkKey,
      Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]),
    );
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
    const record = body.subarray(21 + idLength);
    const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(record.subarray(record.length - 16));
    const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
    expect(padded[padded.length - 1]).toBe(2);
    return padded.subarray(0, padded.length - 1);
  };
  return {
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
    decrypt,
  };
}

describe('encryptPayload', () => {
  it('reproduces the example in RFC 8291', () => {
    const body = encryptPayload(
      rfc.plaintext,
      { p256dh: rfc.uaPublic, auth: rfc.auth },
      {
        salt: rfc.salt,
        serverPrivateKey: rfc.asPrivate,
      },
    );
    expect(body.subarray(0, 86).equals(rfc.header)).toBe(true);
    expect(body.subarray(86).equals(rfc.ciphertext)).toBe(true);
  });

  it('encrypts with fresh keys that the user agent can decrypt', () => {
    const agent = userAgent();
    const message = Buffer.from(JSON.stringify({ title: 'クマ', body: 'テスト' }));
    const first = encryptPayload(message, agent.keys);
    expect(agent.decrypt(first).equals(message)).toBe(true);
    // A new salt and server key every time.
    expect(encryptPayload(message, agent.keys).subarray(0, 16).equals(first.subarray(0, 16))).toBe(false);
  });

  it('keeps the whole body within 4096 bytes and refuses more', () => {
    const agent = userAgent();
    expect(encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES), agent.keys).length).toBe(4096);
    expect(() => encryptPayload(Buffer.alloc(MAX_PAYLOAD_BYTES + 1), agent.keys)).toThrow('too large');
  });

  it('rejects malformed subscription keys', () => {
    expect(() => encryptPayload(Buffer.from('x'), { p256dh: 'AAAA', auth: rfc.auth })).toThrow('p256dh');
  });
});

describe('vapidAuthorization', () => {
  it('signs an ES256 token for the push service origin', () => {
    const keys = vapidKeys();
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, Date.UTC(2026, 8, 24));
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head = '', claims = '', signature = '', k] = match ?? [];
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(b64(head).toString())).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(b64(claims).toString())).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: Date.UTC(2026, 8, 24) / 1000 + 12 * 3600,
      sub: 'mailto:labs@example.test',
    });
    const raw = b64(keys.publicKey);
    const publicKey = createPublicKey({
      format: 'jwk',
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: raw.subarray(1, 33).toString('base64url'),
        y: raw.subarray(33).toString('base64url'),
      },
    });
    expect(
      verify('sha256', Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(signature)),
    ).toBe(true);
  });
});

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ])('accepts %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/x',
    'not a url',
  ])('refuses %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe('createPushSender', () => {
  const target = () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: userAgent().keys });
  const message = { title: 't', body: 'b', url: '/labs' };

  it('posts the encrypted message with VAPID, TTL and urgency', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    const send = createPushSender({ vapid: vapidKeys, fetch, now: () => 0 });
    expect(await send(target(), message, { ttlSeconds: 600, urgency: 'high' })).toBe('sent');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '600', Urgency: 'high' });
    expect(init.redirect).toBe('error');
  });

  it.each([
    [404, 'gone'],
    [410, 'gone'],
    [429, 'failed'],
    [500, 'failed'],
  ])('maps status %i to %s', async (status, outcome) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    const send = createPushSender({ vapid: vapidKeys, fetch });
    expect(await send(target(), message, { ttlSeconds: 60, urgency: 'normal' })).toBe(outcome);
  });

  it('treats a network error as a failure and never contacts an unknown host', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('down'));
    const send = createPushSender({ vapid: vapidKeys, fetch });
    expect(await send(target(), message, { ttlSeconds: 60, urgency: 'normal' })).toBe('failed');
    fetch.mockClear();
    const other = { ...target(), endpoint: 'https://internal.example.test/x' };
    expect(await send(other, message, { ttlSeconds: 60, urgency: 'normal' })).toBe('gone');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['by default after ten seconds', undefined, 10_000],
    ['after the time a caller gives it', 5_000, 5_000],
  ])('gives up on a push service that does not answer: %s', async (_name, timeoutMs, limit) => {
    vi.useFakeTimers();
    try {
      // A push service that never answers; only the abort ends the request.
      const fetch = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
      const send = createPushSender({ vapid: vapidKeys, fetch });
      let outcome: string | null = null;
      void send(target(), message, { ttlSeconds: 60, urgency: 'high', timeoutMs }).then((value) => {
        outcome = value;
      });
      await vi.advanceTimersByTimeAsync(limit - 1);
      expect(outcome).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(outcome).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses to send without VAPID keys', async () => {
    const send = createPushSender({ vapid: () => null, fetch: vi.fn() });
    await expect(send(target(), message, { ttlSeconds: 60, urgency: 'normal' })).rejects.toThrow('VAPID');
  });
});

describe('key checks', () => {
  it('accepts only points on the curve as a subscription key (M1)', () => {
    expect(isValidUserAgentKey(userAgent().keys.p256dh)).toBe(true);
    expect(isValidUserAgentKey(`B${'A'.repeat(86)}`)).toBe(false);
    expect(isValidUserAgentKey('AAAA')).toBe(false);
  });

  it('drops a subscription whose key cannot be used, without contacting the push service (M1)', async () => {
    const fetch = vi.fn();
    const send = createPushSender({ vapid: vapidKeys, fetch });
    const broken = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      keys: { p256dh: `B${'A'.repeat(86)}`, auth: rfc.auth },
    };
    expect(await send(broken, { title: 't', body: 'b', url: '/labs' }, { ttlSeconds: 60, urgency: 'normal' })).toBe(
      'gone',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a VAPID public key that does not belong to the private key (m10)', () => {
    const keys = vapidKeys();
    expect(() => assertVapidKeyPair(keys.publicKey, keys.privateKey)).not.toThrow();
    expect(() => assertVapidKeyPair(vapidKeys().publicKey, keys.privateKey)).toThrow('does not belong');
    expect(() => assertVapidKeyPair(keys.publicKey, 'A'.repeat(43))).toThrow();
  });
});
