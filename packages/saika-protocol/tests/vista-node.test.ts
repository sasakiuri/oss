// SPDX-License-Identifier: MIT
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createVistaServer,
  loadVistaCredentials,
  rotateVistaCredentials,
  requestVista,
  type VistaServer,
} from '../src/vista-node';

const identity = {
  protocolVersion: 1 as const,
  sourceId: 'lane-1',
  bootId: 'boot-1',
  kind: 'lane' as const,
  name: 'Lane 1',
};
const secret = randomBytes(32).toString('base64url');
const servers: VistaServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
const start = async (
  handle: Parameters<typeof createVistaServer>[0]['handle'],
  readSecret: string | (() => string) = secret,
) => {
  const server = await createVistaServer({ identity, secret: readSecret, handle });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
};

function envelope(overrides: Record<string, unknown> = {}): string {
  const iv = randomBytes(12);
  const aad = Buffer.from('saika-vista/v1');
  const key = createHash('sha256').update(aad).update(secret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const value = {
    direction: 'request',
    requestId: randomUUID(),
    timestamp: Date.now(),
    targetId: identity.sourceId,
    method: 'GET',
    path: '/vista/v1/catalog',
    ...overrides,
  };
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  });
}

function responseValue(input: string): Record<string, unknown> {
  const value = JSON.parse(input) as { iv: string; tag: string; data: string };
  const aad = Buffer.from('saika-vista/v1');
  const key = createHash('sha256').update(aad).update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(value.data, 'base64')), decipher.final()]).toString('utf8'),
  ) as Record<string, unknown>;
}

describe('Vista LAN authorization', () => {
  it('publishes only public identity and encrypts authenticated response data', async () => {
    const endpoint = await start(() => ({ privateName: 'Private athlete', shots: [10.9] }));
    const hello = (await (await fetch(`${endpoint}/vista/v1/identity`)).json()) as { serverSession: string };
    expect(hello).toEqual({ ...identity, serverSession: expect.any(String) });
    expect((await fetch(`${endpoint}/vista/v1/catalog`)).status).toBe(404);
    expect(await requestVista(endpoint, secret, 'GET', '/vista/v1/catalog', undefined, 'lane-1')).toEqual({
      privateName: 'Private athlete',
      shots: [10.9],
    });
    const response = await fetch(`${endpoint}/vista/v1/secure`, {
      method: 'POST',
      body: envelope({ serverSession: hello.serverSession }),
    });
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain('Private athlete');
    expect(raw).not.toContain(secret);
  });

  it('rejects wrong pairing, wrong stable identity, replay and reflected envelopes', async () => {
    const handle = vi.fn(() => 'ok');
    const endpoint = await start(handle);
    await expect(requestVista(endpoint, 'x'.repeat(43), 'GET', '/vista/v1/catalog')).rejects.toThrow('rejected');
    await expect(requestVista(endpoint, secret, 'GET', '/vista/v1/catalog', undefined, 'other-device')).rejects.toThrow(
      'rejected',
    );
    const { serverSession } = (await (await fetch(`${endpoint}/vista/v1/identity`)).json()) as {
      serverSession: string;
    };
    const payload = envelope({ serverSession });
    const send = (body: string) => fetch(`${endpoint}/vista/v1/secure`, { method: 'POST', body });
    const valid = await send(payload);
    expect(valid.status).toBe(200);
    const response = await valid.text();
    expect((await send(payload)).status).toBe(401);
    expect((await send(response)).status).toBe(401);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it.each([-60_000, 60_000])(
    'diagnoses authenticated clock skew of %i ms without executing the request',
    async (skew) => {
      const handle = vi.fn(() => 'ok');
      const endpoint = await start(handle);
      const { serverSession } = (await (await fetch(`${endpoint}/vista/v1/identity`)).json()) as {
        serverSession: string;
      };
      const requestId = randomUUID();
      const payload = envelope({ serverSession, requestId, timestamp: Date.now() + skew });
      const response = await fetch(`${endpoint}/vista/v1/secure`, { method: 'POST', body: payload });
      expect(response.status).toBe(200);
      const raw = await response.text();
      expect(raw).not.toContain('clocks');
      expect(responseValue(raw)).toEqual({
        direction: 'response',
        serverSession,
        requestId,
        sourceId: identity.sourceId,
        response: {
          ok: false,
          error: 'Vista request expired or device clocks are out of sync. Synchronize both PCs and retry.',
        },
      });
      expect(handle).not.toHaveBeenCalled();
      expect((await fetch(`${endpoint}/vista/v1/secure`, { method: 'POST', body: payload })).status).toBe(401);
      expect(await requestVista(endpoint, secret, 'GET', '/vista/v1/catalog', undefined, identity.sourceId)).toBe('ok');
      expect(handle).toHaveBeenCalledTimes(1);
    },
  );

  it('rotates pairing without accepting the old key and preserves application allowlists', async () => {
    let current = secret;
    const endpoint = await start(
      (method, path) => {
        if (method !== 'GET' || path !== '/vista/v1/catalog') throw new Error('Read-only source');
        return 'ok';
      },
      () => current,
    );
    await expect(requestVista(endpoint, secret, 'POST', '/vista/v1/start')).rejects.toThrow('Read-only');
    current = randomBytes(32).toString('base64url');
    await expect(requestVista(endpoint, secret, 'GET', '/vista/v1/catalog')).rejects.toThrow('rejected');
    expect(await requestVista(endpoint, current, 'GET', '/vista/v1/catalog')).toBe('ok');
  });

  it('rejects URL credentials and reuses private persisted device identity', async () => {
    await expect(requestVista('http://secret@127.0.0.1:1', secret, 'GET', '/vista/v1/catalog')).rejects.toThrow(
      'endpoint',
    );
    const directory = mkdtempSync(join(tmpdir(), 'vista-credentials-'));
    try {
      const file = join(directory, 'pairing.json');
      const original = loadVistaCredentials(file);
      expect(loadVistaCredentials(file)).toEqual(original);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(original);
      const rotated = rotateVistaCredentials(file);
      expect(rotated.sourceId).toBe(original.sourceId);
      expect(rotated.secret).not.toBe(original.secret);
      expect(loadVistaCredentials(file)).toEqual(rotated);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.skipIf(process.platform === 'win32')('restricts persisted credentials to the owner', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vista-credentials-mode-'));
    try {
      const file = join(directory, 'pairing.json');
      loadVistaCredentials(file);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      rotateVistaCredentials(file);
      expect(statSync(file).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('rejects captured mutation ciphertext after listener restart even with an unchanged bootId and secret', async () => {
    const originalHandle = vi.fn(() => 'removed');
    const endpoint = await start(originalHandle);
    const { serverSession } = (await (await fetch(`${endpoint}/vista/v1/identity`)).json()) as {
      serverSession: string;
    };
    const payload = envelope({ serverSession, method: 'POST', path: '/vista/v1/display/remove' });
    expect((await fetch(`${endpoint}/vista/v1/secure`, { method: 'POST', body: payload })).status).toBe(200);
    const original = servers.pop()!;
    await original.close();
    const replacementHandle = vi.fn(() => 'removed');
    const replacement = await createVistaServer({ identity, secret, port: original.port, handle: replacementHandle });
    servers.push(replacement);
    const hello = (await (await fetch(`${endpoint}/vista/v1/identity`)).json()) as { serverSession: string };
    expect(hello.serverSession).not.toBe(serverSession);
    expect((await fetch(`${endpoint}/vista/v1/secure`, { method: 'POST', body: payload })).status).toBe(401);
    expect(replacementHandle).not.toHaveBeenCalled();
    expect(await requestVista(endpoint, secret, 'POST', '/vista/v1/display/remove')).toBe('removed');
    expect(replacementHandle).toHaveBeenCalledTimes(1);
  });
});
