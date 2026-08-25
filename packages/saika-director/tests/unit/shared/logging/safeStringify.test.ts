import { safeStringify } from '@/shared/logging/safeStringify';

describe('safeStringify', () => {
  it('handles null', () => {
    expect(safeStringify(null)).toBe('null');
  });

  it('handles undefined', () => {
    expect(safeStringify(undefined)).toBe('undefined');
  });

  it('handles primitives', () => {
    expect(safeStringify(42)).toBe('42');
    expect(safeStringify('hello')).toBe('hello');
    expect(safeStringify(true)).toBe('true');
  });

  it('handles Error objects', () => {
    const error = new Error('test error');
    const result = JSON.parse(safeStringify(error));
    expect(result.name).toBe('Error');
    expect(result.message).toBe('test error');
    expect(result.stack).toBeDefined();
  });

  it('handles Date objects', () => {
    const date = new Date('2025-01-01T00:00:00.000Z');
    expect(safeStringify(date)).toBe('2025-01-01T00:00:00.000Z');
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(safeStringify(obj)).toContain('[Circular]');
  });

  it('handles arrays', () => {
    expect(safeStringify([1, 2, 3])).toBe('[1,2,3]');
  });

  it('handles nested objects', () => {
    const result = safeStringify({ a: 1, b: 'two' });
    expect(result).toBe('{"a":1,"b":two}');
  });
});
