// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import {
  BPT216ProtocolSession,
  type BPT216SerialPort,
} from '@/main/modules/connection/infra/usb/bpt216/BPT216ProtocolSession';

class FakePort implements BPT216SerialPort {
  private listener: ((chunk: Buffer) => void) | null = null;

  on(_event: 'data', listener: (chunk: Buffer) => void): void {
    this.listener = listener;
  }

  removeListener(_event: 'data', listener: (chunk: Buffer) => void): void {
    if (this.listener === listener) this.listener = null;
  }

  emit(chunk: string): void {
    this.listener?.(Buffer.from(chunk));
  }
}

describe('BPT216ProtocolSession', () => {
  it('buffers split input and forwards only complete T frames', () => {
    const port = new FakePort();
    const onFrame = vi.fn();
    const receivedAt = new Date('2026-08-14T00:00:00.000Z');
    const session = new BPT216ProtocolSession(port, { onFrame, clock: { now: () => receivedAt } });
    session.start();

    port.emit('0.0,0,0,0,0,R\r\n0.0,10,20,0,0,B\n10.90,12');
    expect(onFrame).not.toHaveBeenCalled();
    port.emit('3,-456,0,0,T\r\n');

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(Buffer.from('10.90,123,-456,0,0,T'), receivedAt);
  });

  it('ignores status, unknown, blank, and malformed non-shot lines', () => {
    const port = new FakePort();
    const onFrame = vi.fn();
    const session = new BPT216ProtocolSession(port, { onFrame });
    session.start();

    port.emit('\n0.0,9999,0,0,0,R,2.01\nmalformed\n0,0,0,0,0,X\n');

    expect(onFrame).not.toHaveBeenCalled();
  });

  it('trims CR and surrounding ASCII whitespace', () => {
    const port = new FakePort();
    const onFrame = vi.fn();
    const session = new BPT216ProtocolSession(port, { onFrame });
    session.start();

    port.emit('  9.70,0,0,0,0,T  \r\n');

    expect(onFrame).toHaveBeenCalledWith(Buffer.from('9.70,0,0,0,0,T'), expect.any(Date));
  });

  it('clears an unterminated oversized frame and resumes at the next frame', () => {
    const port = new FakePort();
    const onFrame = vi.fn();
    const onWarning = vi.fn();
    const session = new BPT216ProtocolSession(port, { onFrame, onWarning, maxFrameBytes: 24 });
    session.start();

    port.emit('x'.repeat(25));
    port.emit('9.7,0,0,0,0,T\n');

    expect(onWarning).toHaveBeenCalledWith('FRAME_TOO_LONG');
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('removes its listener and clears partial data when stopped', () => {
    const port = new FakePort();
    const onFrame = vi.fn();
    const session = new BPT216ProtocolSession(port, { onFrame });
    session.start();
    port.emit('9.7,0,');
    session.stop();
    port.emit('0,0,0,T\n');

    expect(onFrame).not.toHaveBeenCalled();
  });
});
