import { describe, it, expect } from 'vitest';
import { Result, createParseError } from '@/shared/types/Result';

// Use Result directly - it exports both type and static methods
const ResultUtil = Result;

describe('Result', () => {
  describe('ok', () => {
    it('should create success result', () => {
      const result = ResultUtil.ok(42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });
  });

  describe('err', () => {
    it('should create error result', () => {
      const error = new Error('test error');
      const result = ResultUtil.err(error);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe('isOk', () => {
    it('should return true for ok result', () => {
      const result = ResultUtil.ok(42);
      expect(ResultUtil.isOk(result)).toBe(true);
    });

    it('should return false for err result', () => {
      const result = ResultUtil.err(new Error('test'));
      expect(ResultUtil.isOk(result)).toBe(false);
    });
  });

  describe('isErr', () => {
    it('should return true for err result', () => {
      const result = ResultUtil.err(new Error('test'));
      expect(ResultUtil.isErr(result)).toBe(true);
    });

    it('should return false for ok result', () => {
      const result = ResultUtil.ok(42);
      expect(ResultUtil.isErr(result)).toBe(false);
    });
  });

  describe('map', () => {
    it('should transform ok value', () => {
      const result = ResultUtil.ok(21);
      const mapped = ResultUtil.map(result, (x) => x * 2);
      expect(mapped.success).toBe(true);
      if (mapped.success) {
        expect(mapped.data).toBe(42);
      }
    });

    it('should pass through err value', () => {
      const error = new Error('test');
      const result: Result<number, Error> = ResultUtil.err(error);
      const mapped = ResultUtil.map(result, (x: number) => x * 2);
      expect(mapped.success).toBe(false);
      if (!mapped.success) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe('mapErr', () => {
    it('should transform err value', () => {
      const result: Result<number, string> = ResultUtil.err('original');
      const mapped = ResultUtil.mapErr(result, (e) => `modified: ${e}`);
      expect(mapped.success).toBe(false);
      if (!mapped.success) {
        expect(mapped.error).toBe('modified: original');
      }
    });

    it('should pass through ok value', () => {
      const result: Result<number, string> = ResultUtil.ok(42);
      const mapped = ResultUtil.mapErr(result, (e) => `modified: ${e}`);
      expect(mapped.success).toBe(true);
      if (mapped.success) {
        expect(mapped.data).toBe(42);
      }
    });
  });

  describe('flatMap', () => {
    it('should chain ok results', () => {
      const result = ResultUtil.ok(21);
      const chained = ResultUtil.flatMap(result, (x) => ResultUtil.ok(x * 2));
      expect(chained.success).toBe(true);
      if (chained.success) {
        expect(chained.data).toBe(42);
      }
    });

    it('should short-circuit on err', () => {
      const error = new Error('test');
      const result: Result<number, Error> = ResultUtil.err(error);
      const chained = ResultUtil.flatMap(result, (x: number) => ResultUtil.ok(x * 2));
      expect(chained.success).toBe(false);
      if (!chained.success) {
        expect(chained.error).toBe(error);
      }
    });

    it('should propagate inner err', () => {
      const result = ResultUtil.ok(21);
      const innerError = new Error('inner');
      const chained = ResultUtil.flatMap(result, () => ResultUtil.err(innerError));
      expect(chained.success).toBe(false);
      if (!chained.success) {
        expect(chained.error).toBe(innerError);
      }
    });
  });

  describe('unwrapOr', () => {
    it('should return value for ok result', () => {
      const result = ResultUtil.ok(42);
      expect(ResultUtil.unwrapOr(result, 0)).toBe(42);
    });

    it('should return default for err result', () => {
      const result: Result<number, Error> = ResultUtil.err(new Error('test'));
      expect(ResultUtil.unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('unwrap', () => {
    it('should return value for ok result', () => {
      const result = ResultUtil.ok(42);
      expect(ResultUtil.unwrap(result)).toBe(42);
    });

    it('should throw for err result', () => {
      const result: Result<number, Error> = ResultUtil.err(new Error('test error'));
      expect(() => ResultUtil.unwrap(result)).toThrow('test error');
    });
  });

  describe('unwrapErr', () => {
    it('should return error for err result', () => {
      const error = new Error('test');
      const result: Result<number, Error> = ResultUtil.err(error);
      expect(ResultUtil.unwrapErr(result)).toBe(error);
    });

    it('should throw for ok result', () => {
      const result = ResultUtil.ok(42);
      expect(() => ResultUtil.unwrapErr(result)).toThrow('Called unwrapErr on Ok value');
    });
  });

  describe('tryCatch', () => {
    it('should return ok for successful function', () => {
      const result = ResultUtil.tryCatch(() => 42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it('should return err for throwing function', () => {
      const result = ResultUtil.tryCatch<number, Error>(() => {
        throw new Error('test error');
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('test error');
      }
    });

    it('should use error mapper when provided', () => {
      const result = ResultUtil.tryCatch<number, string>(
        () => {
          throw new Error('original');
        },
        (e) => `mapped: ${(e as Error).message}`,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('mapped: original');
      }
    });
  });

  describe('fromPromise', () => {
    it('should return ok for resolved promise', async () => {
      const result = await ResultUtil.fromPromise(Promise.resolve(42));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });

    it('should return err for rejected promise', async () => {
      const error = new Error('test error');
      const result = await ResultUtil.fromPromise<number, Error>(Promise.reject(error));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });

    it('should use error mapper when provided', async () => {
      const result = await ResultUtil.fromPromise<number, string>(
        Promise.reject(new Error('original')),
        (e) => `mapped: ${(e as Error).message}`,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('mapped: original');
      }
    });
  });
});

describe('createParseError', () => {
  it('should create parse error with code and message', () => {
    const error = createParseError('TEST_001', 'Test error message');
    expect(error.code).toBe('TEST_001');
    expect(error.message).toBe('Test error message');
    expect(error.context).toBeUndefined();
  });

  it('should create parse error with context', () => {
    const error = createParseError('TEST_001', 'Test error message', {
      field: 'test',
      value: 42,
    });
    expect(error.code).toBe('TEST_001');
    expect(error.message).toBe('Test error message');
    expect(error.context).toEqual({ field: 'test', value: 42 });
  });
});
