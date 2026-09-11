// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVistaDiscovery, discoverVistaNodes } from '../src/vista-node';

const network = vi.hoisted(() => ({ createSocket: vi.fn(), networkInterfaces: vi.fn() }));
vi.mock('node:dgram', () => ({ createSocket: network.createSocket }));
vi.mock('node:os', () => ({ networkInterfaces: network.networkInterfaces }));

const group = '239.255.83.37';
const wifi = '10.0.0.1';
const unavailable = '10.0.1.1';
const ethernet = '10.0.2.1';
const identity = {
  protocolVersion: 1 as const,
  sourceId: 'lane-1',
  bootId: 'boot-1',
  kind: 'lane' as const,
  name: 'Lane 1',
};

/** UDP chooses the outgoing interface when an asynchronous send completes. */
class DiscoverySocket extends EventEmitter {
  readonly memberships = new Set<string>();
  readonly transmissions: { address: string; interface: string; payload: Buffer }[] = [];
  readonly failedSelections = new Set<string>();
  readonly failedSends = new Set<string>();
  interface = wifi;
  closed = false;
  delay = 10;

  bind(_port: number, _address: string, callback: () => void): void {
    queueMicrotask(callback);
  }

  addMembership(_group: string, address = wifi): void {
    if (address === unavailable) throw new Error('Interface unavailable');
    this.memberships.add(address);
  }

  setMulticastTTL(): void {}

  setMulticastInterface(address: string): void {
    if (this.failedSelections.has(address)) throw new Error('Interface unavailable');
    this.interface = address;
  }

  send(payload: Buffer, _port: number, address: string, callback?: (error: Error | null) => void): void {
    setTimeout(() => {
      if (this.closed) {
        callback?.(new Error('Socket closed'));
        return;
      }
      this.transmissions.push({ address, interface: this.interface, payload });
      if (this.failedSends.has(this.interface)) {
        if (callback) callback(new Error('Network unreachable'));
        else this.emit('error', new Error('Network unreachable'));
        return;
      }
      if (address === group) {
        this.emit(
          'message',
          Buffer.from(JSON.stringify({ protocol: 'saika-vista-discovery/1', identity, port: 45831 })),
          { address: this.interface },
        );
      }
      callback?.(null);
    }, this.delay);
  }

  close(): void {
    this.closed = true;
  }
}

let socket: DiscoverySocket;
beforeEach(() => {
  vi.useFakeTimers();
  socket = new DiscoverySocket();
  network.createSocket.mockReturnValue(socket);
  network.networkInterfaces.mockReturnValue({
    wifi: [{ family: 'IPv4', address: wifi, internal: false }],
    unavailable: [{ family: 'IPv4', address: unavailable, internal: false }],
    ethernet: [{ family: 'IPv4', address: ethernet, internal: false }],
    loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  });
});
afterEach(() => vi.useRealTimers());

describe('Vista discovery across network interfaces', () => {
  it('answers on every available LAN interface even if another interface cannot join', async () => {
    const discovery = createVistaDiscovery(identity, 45831);
    await vi.advanceTimersByTimeAsync(0);
    for (const address of [wifi, ethernet]) {
      // A datagram reaches the listener only when it joined that receiving interface.
      if (socket.memberships.has(address))
        socket.emit('message', Buffer.from('saika-vista-discover/1'), { address, port: 12345 });
    }
    await vi.advanceTimersByTimeAsync(20);
    expect(socket.transmissions.map((packet) => packet.address)).toEqual([wifi, ethernet]);
    expect(socket.memberships.has('127.0.0.1')).toBe(false);
    discovery.close();
  });

  it.each(['selection', 'send'] as const)(
    'finds peers on both LANs despite an intervening interface %s failure',
    async (failure) => {
      if (failure === 'selection') socket.failedSelections.add(unavailable);
      else socket.failedSends.add(unavailable);
      const result = discoverVistaNodes(100);
      await vi.advanceTimersByTimeAsync(100);
      expect((await result).map((node) => node.endpoint)).toEqual([`http://${wifi}:45831`, `http://${ethernet}:45831`]);
      expect(socket.closed).toBe(true);
    },
  );

  it('stops sending when discovery expires during an asynchronous send', async () => {
    socket.delay = 75;
    const result = discoverVistaNodes(100);
    await vi.advanceTimersByTimeAsync(200);
    expect((await result).map((node) => node.endpoint)).toEqual([`http://${wifi}:45831`]);
    expect(socket.transmissions).toHaveLength(1);
    expect(socket.closed).toBe(true);
  });
});
