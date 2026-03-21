// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { MT201DataParser } from '@/main/modules/target/adapters/mt201/MT201DataParser';
import { DomainError } from '@/shared/errors/DomainError';

describe('MT201DataParser', () => {
  let parser: MT201DataParser;

  beforeEach(() => {
    parser = new MT201DataParser();
  });

  describe('parse() - normal cases', () => {
    it('should correctly parse standard format (with space)', () => {
      const buffer = Buffer.from('R 9.7 0250 FF5F 70');
      const result = parser.parse(buffer);

      expect(result.mode).toBe('R');
      expect(result.score).toBe(9.7);
      expect(result.xHex).toBe('0250');
      expect(result.yHex).toBe('FF5F');
      expect(result.checksum).toBe('70');
    });

    it('should correctly parse format without space', () => {
      const buffer = Buffer.from('R10.9 0000 0000 70');
      const result = parser.parse(buffer);

      expect(result.mode).toBe('R');
      expect(result.score).toBe(10.9);
      expect(result.xHex).toBe('0000');
      expect(result.yHex).toBe('0000');
      expect(result.checksum).toBe('70');
    });

    it('should normalize lowercase HEX to uppercase and parse', () => {
      const buffer = Buffer.from('R 9.7 0250 ff5f 70');
      const result = parser.parse(buffer);

      expect(result.xHex).toBe('0250');
      expect(result.yHex).toBe('FF5F');
      expect(result.checksum).toBe('70');
    });

    it('should correctly parse mode S', () => {
      const buffer = Buffer.from('S 5.5 0100 0200 71');
      const result = parser.parse(buffer);

      expect(result.mode).toBe('S');
      expect(result.score).toBe(5.5);
      expect(result.xHex).toBe('0100');
      expect(result.yHex).toBe('0200');
      expect(result.checksum).toBe('71');
    });

    it('should correctly parse score 0.0', () => {
      const buffer = Buffer.from('R 0.0 7FFF 7FFF 73');
      const result = parser.parse(buffer);

      expect(result.mode).toBe('R');
      expect(result.score).toBe(0.0);
      expect(result.xHex).toBe('7FFF');
      expect(result.yHex).toBe('7FFF');
    });

    it('should correctly parse score 10.5', () => {
      const buffer = Buffer.from('R10.5 00D0 FFC8 71');
      const result = parser.parse(buffer);

      expect(result.score).toBe(10.5);
    });

    it('should trim leading/trailing whitespace and parse', () => {
      const buffer = Buffer.from('  R 9.7 0250 FF5F 70  ');
      const result = parser.parse(buffer);

      expect(result.mode).toBe('R');
      expect(result.score).toBe(9.7);
    });
  });

  describe('parse() - error cases', () => {
    it('should throw DATA_CONVERSION_ERROR for format mismatch', () => {
      const buffer = Buffer.from('INVALID_DATA');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      }
    });

    it('should throw DATA_CONVERSION_ERROR for empty data', () => {
      const buffer = Buffer.from('');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      }
    });

    it('should throw DATA_CONVERSION_ERROR for data that is too short', () => {
      const buffer = Buffer.from('R 9.7 0250');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR for invalid mode (not R/S)', () => {
      const buffer = Buffer.from('X 9.7 0250 FF5F 70');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR for invalid score (non-numeric)', () => {
      const buffer = Buffer.from('R abc 0250 FF5F 70');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR for invalid X coordinate HEX', () => {
      const buffer = Buffer.from('R 9.7 GHIJ FF5F 70');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR for invalid Y coordinate HEX', () => {
      const buffer = Buffer.from('R 9.7 0250 WXYZ 70');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR for invalid checksum HEX', () => {
      const buffer = Buffer.from('R 9.7 0250 FF5F ZZ');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('should throw VALIDATION_ERROR for insufficient X coordinate HEX digits', () => {
      const buffer = Buffer.from('R 9.7 025  FF5F 70');

      try {
        parser.parse(buffer);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
