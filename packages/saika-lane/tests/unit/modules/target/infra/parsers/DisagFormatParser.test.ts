// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { DisagFormatParser } from '@/main/modules/target/infra/parsers/DisagFormatParser';

describe('DisagFormatParser', () => {
  const parser = new DisagFormatParser();
  const manufacturer = TargetManufacturer.disag();

  it('should parse XML-format messages', () => {
    const xml = '<shot><x>12.5</x><y>-8.3</y></shot>';
    const buffer = Buffer.from(xml + '\n');

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
    expect(results[0]!.raw.toString()).toBe(xml);
    expect(remaining.toString()).toBe('');
  });

  it('should process multiple XML lines', () => {
    const xml1 = '<shot><x>12.5</x><y>-8.3</y></shot>';
    const xml2 = '<shot><x>5.0</x><y>10.2</y></shot>';
    const buffer = Buffer.from(xml1 + '\n' + xml2 + '\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(2);
  });

  it('should skip lines without shot tag', () => {
    const buffer = Buffer.from('<data>invalid</data>\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
  });

  it('should skip lines with only opening tag', () => {
    const buffer = Buffer.from('<shot>no closing tag\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
  });

  it('should return incomplete lines in remaining', () => {
    const buffer = Buffer.from('<shot><x>12.5</x>');

    const { results, remaining } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(0);
    expect(remaining.toString()).toBe('<shot><x>12.5</x>');
  });

  it('should skip empty lines', () => {
    const xml = '<shot><x>1</x><y>2</y></shot>';
    const buffer = Buffer.from('\n' + xml + '\n\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(results).toHaveLength(1);
  });

  it('should have frozen RawData', () => {
    const xml = '<shot><x>1</x><y>2</y></shot>';
    const buffer = Buffer.from(xml + '\n');

    const { results } = parser.parse(buffer, manufacturer);

    expect(Object.isFrozen(results[0])).toBe(true);
  });
});
