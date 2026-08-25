import { describe, it, expect } from 'vitest';
import { Checksum } from '@/main/modules/lane-control';

describe('Checksum', () => {
  it('should calculate checksum for C01C command', () => {
    const cs = Checksum.calculate('C01C');
    expect(cs.value).toBe('E7');
  });

  it('should calculate checksum for C01A command', () => {
    const cs = Checksum.calculate('C01A');
    expect(cs.value).toBe('E5');
  });

  it('should calculate checksum for C06C command', () => {
    const cs = Checksum.calculate('C06C');
    expect(cs.value).toBe('EC');
  });

  it('should calculate checksum for C06A command', () => {
    const cs = Checksum.calculate('C06A');
    expect(cs.value).toBe('EA');
  });

  it('should calculate checksum for C10C command', () => {
    const cs = Checksum.calculate('C10C');
    expect(cs.value).toBe('E7');
  });

  it('should calculate checksum for C10A command', () => {
    const cs = Checksum.calculate('C10A');
    expect(cs.value).toBe('E5');
  });

  it('should verify a valid response checksum', () => {
    const cs = Checksum.fromHex('01');
    expect(cs.verify('D0600106.2')).toBe(true);
  });

  it('should verify type C response checksum', () => {
    const cs = Checksum.fromHex('04');
    expect(cs.verify('D061021042')).toBe(true);
  });

  it('should detect invalid checksum', () => {
    const cs = Checksum.fromHex('FF');
    expect(cs.verify('D0600106.2')).toBe(false);
  });
});
