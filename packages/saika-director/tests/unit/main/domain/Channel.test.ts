import { describe, it, expect } from 'vitest';
import { Channel } from '@/main/modules/lane-control';

describe('Channel', () => {
  it('should create valid channel 1', () => {
    const ch = Channel.create(1);
    expect(ch.value).toBe(1);
    expect(ch.toString()).toBe('01');
  });

  it('should create valid channel 10', () => {
    const ch = Channel.create(10);
    expect(ch.value).toBe(10);
    expect(ch.toString()).toBe('10');
  });

  it('should create valid channel 99 (ABSOLUTE_MAX)', () => {
    const ch = Channel.create(99);
    expect(ch.value).toBe(99);
    expect(ch.toString()).toBe('99');
  });

  it('should throw for channel 0', () => {
    expect(() => Channel.create(0)).toThrow();
  });

  it('should throw for channel 100 (exceeds ABSOLUTE_MAX)', () => {
    expect(() => Channel.create(100)).toThrow();
  });

  it('should throw for non-integer', () => {
    expect(() => Channel.create(1.5)).toThrow();
  });

  it('should respect custom maxChannel parameter', () => {
    expect(() => Channel.create(11, 10)).toThrow();
    const ch = Channel.create(10, 10);
    expect(ch.value).toBe(10);
  });

  it('should correctly compare equal channels', () => {
    const ch1 = Channel.create(5);
    const ch2 = Channel.create(5);
    expect(ch1.equals(ch2)).toBe(true);
  });

  it('should correctly compare different channels', () => {
    const ch1 = Channel.create(3);
    const ch2 = Channel.create(7);
    expect(ch1.equals(ch2)).toBe(false);
  });
});
