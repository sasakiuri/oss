// SPDX-License-Identifier: MIT
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandIdempotencyGuard } from '@/main/modules/mqtt/infra/CommandIdempotencyGuard';

describe('CommandIdempotencyGuard', () => {
  let guard: CommandIdempotencyGuard;

  beforeEach(() => {
    guard = new CommandIdempotencyGuard(1000); // 1s TTL for tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for a new command', () => {
    expect(guard.check('cmd-1')).toBe(false);
  });

  it('returns true for a duplicate commandId', () => {
    guard.check('cmd-1');
    expect(guard.check('cmd-1')).toBe(true);
  });

  it('tracks multiple distinct commands', () => {
    expect(guard.check('cmd-1')).toBe(false);
    expect(guard.check('cmd-2')).toBe(false);
    expect(guard.check('cmd-1')).toBe(true);
    expect(guard.check('cmd-2')).toBe(true);
    expect(guard.size).toBe(2);
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();

    guard.check('cmd-1');
    expect(guard.check('cmd-1')).toBe(true);

    vi.advanceTimersByTime(1001); // past TTL

    expect(guard.check('cmd-1')).toBe(false); // expired, treated as new
  });

  it('cleanup removes only expired entries', () => {
    vi.useFakeTimers();

    guard.check('cmd-1');
    vi.advanceTimersByTime(500);
    guard.check('cmd-2');
    vi.advanceTimersByTime(501); // cmd-1 expired (1001ms), cmd-2 still valid (501ms)

    // Trigger cleanup via check
    guard.check('cmd-3');

    expect(guard.size).toBe(2); // cmd-2 + cmd-3
    expect(guard.check('cmd-1')).toBe(false); // was cleaned up, treated as new
    expect(guard.check('cmd-2')).toBe(true); // still valid
  });

  it('clear() resets all state', () => {
    guard.check('cmd-1');
    guard.check('cmd-2');
    expect(guard.size).toBe(2);

    guard.clear();

    expect(guard.size).toBe(0);
    expect(guard.check('cmd-1')).toBe(false);
    expect(guard.check('cmd-2')).toBe(false);
  });

  it('uses default TTL of 5 minutes', () => {
    const defaultGuard = new CommandIdempotencyGuard();

    vi.useFakeTimers();

    defaultGuard.check('cmd-1');
    vi.advanceTimersByTime(4 * 60 * 1000); // 4 min
    expect(defaultGuard.check('cmd-1')).toBe(true); // still valid

    vi.advanceTimersByTime(61 * 1000); // past 5 min total
    expect(defaultGuard.check('cmd-1')).toBe(false); // expired
  });
});
