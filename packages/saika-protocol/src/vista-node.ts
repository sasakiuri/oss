// SPDX-License-Identifier: MIT
/** Node-only encrypted LAN transport. Import this subpath only from application main processes. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, request, type IncomingMessage } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname } from 'node:path';

import { VistaIdentitySchema, type VistaIdentity } from './Vista';

const SECURE_PATH = '/vista/v1/secure';
const DISCOVERY_PORT = 45837;
const DISCOVERY_GROUP = '239.255.83.37';
const MAX_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 3000;
const CLOCK_WINDOW_MS = 30_000;
const AAD = Buffer.from('saika-vista/v1');

export interface VistaCredentials {
  sourceId: string;
  secret: string;
}
export interface VistaNode {
  identity: VistaIdentity;
  endpoint: string;
}
export interface VistaServer {
  port: number;
  endpoints: string[];
  close(): Promise<void>;
}

/** Pairing credentials stay on the owning device; never include them in discovery or URLs. */
export function loadVistaCredentials(filePath: string): VistaCredentials {
  if (existsSync(filePath)) {
    const value = JSON.parse(readFileSync(filePath, 'utf8')) as VistaCredentials;
    if (
      typeof value.sourceId !== 'string' ||
      !value.sourceId ||
      typeof value.secret !== 'string' ||
      value.secret.length < 32
    ) {
      throw new Error('Invalid Vista credentials');
    }
    chmodSync(filePath, 0o600);
    return value;
  }
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const value = { sourceId: randomUUID(), secret: randomBytes(32).toString('base64url') };
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flush: true });
  renameSync(temporary, filePath);
  return value;
}

/** Revoke every previous pairing while preserving this device's stable identity. */
export function rotateVistaCredentials(filePath: string): VistaCredentials {
  const current = loadVistaCredentials(filePath);
  const next = { sourceId: current.sourceId, secret: randomBytes(32).toString('base64url') };
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flush: true });
  renameSync(temporary, filePath);
  return next;
}

function keyFor(secret: string): Buffer {
  if (typeof secret !== 'string' || secret.length < 32 || secret.length > 256)
    throw new Error('Invalid Vista pairing secret');
  return createHash('sha256').update(AAD).update(secret).digest();
}

function encrypt(key: Buffer, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64'),
  });
}

function decrypt(key: Buffer, input: string): Record<string, unknown> {
  const envelope = JSON.parse(input) as Record<string, unknown>;
  if (typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.data !== 'string')
    throw new Error('Invalid envelope');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  const value: unknown = JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'),
  );
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid envelope');
  return value as Record<string, unknown>;
}

async function readBounded(stream: IncomingMessage, limit = MAX_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    length += buffer.length;
    if (length > limit) throw new Error('Vista message exceeds size limit');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function localAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

export async function createVistaServer(options: {
  identity: VistaIdentity;
  secret: string | (() => string);
  port?: number;
  handle: (method: string, path: string, body: unknown) => unknown | Promise<unknown>;
}): Promise<VistaServer> {
  const identity = VistaIdentitySchema.parse(options.identity);
  const readSecret = typeof options.secret === 'function' ? options.secret : () => options.secret as string;
  keyFor(readSecret());
  // A new listener always has a new challenge, even when callers reuse bootId.
  const serverSession = randomUUID();
  const nonces = new Map<string, number>();
  let closed = false;
  const server = createServer({ maxHeaderSize: 8192 }, (req, res) => {
    const deadline = setTimeout(() => {
      req.destroy();
      res.destroy();
    }, TIMEOUT_MS);
    res.on('close', () => clearTimeout(deadline));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/vista/v1/identity') {
      res.end(JSON.stringify({ ...identity, serverSession }));
      return;
    }
    if (req.method !== 'POST' || req.url !== SECURE_PATH || closed) {
      res.writeHead(404).end('{}');
      return;
    }
    void (async () => {
      let message: Record<string, unknown>;
      const authorizedSecret = readSecret();
      const key = keyFor(authorizedSecret);
      try {
        message = decrypt(key, await readBounded(req));
        const now = Date.now();
        if (
          message.direction !== 'request' ||
          message.serverSession !== serverSession ||
          typeof message.requestId !== 'string' ||
          message.requestId.length > 128 ||
          typeof message.timestamp !== 'number' ||
          !Number.isFinite(message.timestamp) ||
          (message.targetId !== null && message.targetId !== identity.sourceId) ||
          (message.method !== 'GET' && message.method !== 'POST') ||
          typeof message.path !== 'string' ||
          !message.path.startsWith('/vista/v1/') ||
          message.path.length > 4096 ||
          closed ||
          readSecret() !== authorizedSecret
        )
          throw new Error('Unauthorized');
        for (const [nonce, expiry] of nonces) if (expiry < now) nonces.delete(nonce);
        if (nonces.has(message.requestId) || nonces.size >= 20_000) throw new Error('Unauthorized');
        nonces.set(message.requestId, now + CLOCK_WINDOW_MS * 2);
      } catch {
        res.writeHead(401).end('{}');
        return;
      }
      let response: unknown;
      if (closed || readSecret() !== authorizedSecret) {
        res.writeHead(401).end('{}');
        return;
      }
      try {
        if (Math.abs(Date.now() - (message.timestamp as number)) > CLOCK_WINDOW_MS) {
          throw new Error('Vista request expired or device clocks are out of sync. Synchronize both PCs and retry.');
        }
        response = {
          ok: true,
          value: await options.handle(message.method as string, message.path as string, message.body),
        };
      } catch (error) {
        // Authenticated clock and application errors are encrypted. Stack traces and secrets stay local.
        response = { ok: false, error: error instanceof Error ? error.message.slice(0, 1024) : 'Vista request failed' };
      }
      if (closed || res.destroyed) return;
      if (readSecret() !== authorizedSecret) {
        res.writeHead(401).end('{}');
        return;
      }
      const payload = encrypt(key, {
        direction: 'response',
        serverSession,
        requestId: message.requestId,
        sourceId: identity.sourceId,
        response,
      });
      if (Buffer.byteLength(payload) > MAX_BYTES) {
        res.writeHead(413).end('{}');
        return;
      }
      res.end(payload);
    })().catch(() => {
      if (!res.destroyed) res.writeHead(500).end('{}');
    });
  });
  server.requestTimeout = TIMEOUT_MS;
  server.headersTimeout = TIMEOUT_MS;
  server.keepAliveTimeout = 1000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Vista server did not bind');
  return {
    port: address.port,
    endpoints: [...localAddresses(), '127.0.0.1'].map((host) => `http://${host}:${address.port}`),
    close: async () => {
      closed = true;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

export async function requestVista<T = unknown>(
  endpoint: string,
  secret: string,
  method: string,
  path: string,
  body?: unknown,
  expectedSourceId?: string,
): Promise<T> {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Use a Vista endpoint in the form http://host:port');
  }
  const deadlineAt = Date.now() + TIMEOUT_MS;
  const key = keyFor(secret);
  // An unauthenticated challenge can only deny service: it is bound into the
  // authenticated request and response before any application operation runs.
  const hello: unknown = JSON.parse(await exchange(new URL('/vista/v1/identity', url), 'GET', undefined, deadlineAt));
  const peer = VistaIdentitySchema.parse(hello);
  const serverSession = (hello as Record<string, unknown>).serverSession;
  if (typeof serverSession !== 'string' || serverSession.length < 32 || serverSession.length > 128)
    throw new Error('Invalid Vista listener challenge');
  if (expectedSourceId !== undefined && peer.sourceId !== expectedSourceId)
    throw new Error('Vista pairing or identity rejected');
  const requestId = randomUUID();
  const payload = encrypt(key, {
    direction: 'request',
    serverSession,
    requestId,
    timestamp: Date.now(),
    targetId: expectedSourceId ?? peer.sourceId,
    method,
    path,
    body,
  });
  if (Buffer.byteLength(payload) > MAX_BYTES) throw new Error('Vista message exceeds size limit');
  const raw = await exchange(new URL(SECURE_PATH, url), 'POST', payload, deadlineAt);
  const message = decrypt(key, raw);
  if (
    message.direction !== 'response' ||
    message.serverSession !== serverSession ||
    message.sourceId !== peer.sourceId ||
    message.requestId !== requestId ||
    typeof message.sourceId !== 'string' ||
    (expectedSourceId !== undefined && message.sourceId !== expectedSourceId)
  )
    throw new Error('Vista response identity mismatch');
  const result = message.response as { ok?: boolean; value?: T; error?: string } | undefined;
  if (!result?.ok) throw new Error(typeof result?.error === 'string' ? result.error : 'Vista request failed');
  return result.value as T;
}

async function exchange(
  url: URL,
  method: 'GET' | 'POST',
  payload: string | undefined,
  deadlineAt: number,
): Promise<string> {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) throw new Error('Vista request timed out');
  return await new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        headers:
          payload === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new Error(
              res.statusCode === 401
                ? 'Vista pairing or identity rejected'
                : `Vista transport failed (${res.statusCode})`,
            ),
          );
          return;
        }
        void readBounded(res, method === 'GET' ? 8192 : MAX_BYTES).then(resolve, reject);
      },
    );
    const deadline = setTimeout(() => req.destroy(new Error('Vista request timed out')), remaining);
    req.once('close', () => clearTimeout(deadline));
    req.once('error', reject);
    req.end(payload);
  });
}

/** Discovery is unauthenticated candidate discovery only; pairing authenticates the selected device. */
export function createVistaDiscovery(identity: VistaIdentity, port: number): { close(): void } {
  const validated = VistaIdentitySchema.parse(identity);
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('error', () => {
    /* Manual endpoints remain usable when multicast is unavailable. */
  });
  socket.on('message', (message, peer) => {
    if (message.length > 256 || message.toString() !== 'saika-vista-discover/1') return;
    const payload = Buffer.from(JSON.stringify({ protocol: 'saika-vista-discovery/1', identity: validated, port }));
    socket.send(payload, peer.port, peer.address);
  });
  socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
    const addresses = localAddresses();
    for (const address of addresses.length ? addresses : [undefined]) {
      try {
        socket.addMembership(DISCOVERY_GROUP, address);
      } catch {
        /* One unavailable interface must not hide devices on the remaining LANs. */
      }
    }
  });
  return {
    close: () => {
      try {
        socket.close();
      } catch {
        /* Already closed. */
      }
    },
  };
}

export async function discoverVistaNodes(timeoutMs = 1200): Promise<VistaNode[]> {
  return await new Promise((resolve) => {
    const nodes = new Map<string, VistaNode>();
    const socket = createSocket('udp4');
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      try {
        socket.close();
      } catch {
        /* Bind may have failed. */
      }
      resolve([...nodes.values()]);
    };
    const deadline = setTimeout(finish, Math.max(100, Math.min(timeoutMs, TIMEOUT_MS)));
    socket.on('error', finish);
    socket.on('message', (message, peer) => {
      if (message.length > 8192) return;
      try {
        const value = JSON.parse(message.toString()) as Record<string, unknown>;
        if (
          value.protocol !== 'saika-vista-discovery/1' ||
          !Number.isInteger(value.port) ||
          (value.port as number) < 1 ||
          (value.port as number) > 65535
        )
          return;
        const identity = VistaIdentitySchema.parse(value.identity);
        const endpoint = `http://${peer.address}:${String(value.port)}`;
        nodes.set(`${identity.sourceId}:${endpoint}`, { identity, endpoint });
      } catch {
        /* Ignore unrelated or malformed LAN packets. */
      }
    });
    socket.bind(0, '0.0.0.0', () => {
      if (finished) return;
      const query = Buffer.from('saika-vista-discover/1');
      void (async () => {
        socket.setMulticastTTL(1);
        for (const address of [undefined, ...localAddresses()]) {
          if (finished) return;
          try {
            if (address !== undefined) socket.setMulticastInterface(address);
            // Node sends asynchronously; keep this interface selected until the send completes.
            await new Promise<void>((sent) => socket.send(query, DISCOVERY_PORT, DISCOVERY_GROUP, () => sent()));
          } catch {
            /* Discovery can continue on other interfaces after a local network failure. */
          }
        }
      })().catch(finish);
    });
  });
}
