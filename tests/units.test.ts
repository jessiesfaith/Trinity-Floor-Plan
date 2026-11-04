import { describe, expect, it } from 'vitest';
import { formatArea, formatLength, parseLength } from '@/lib/units';

describe('units', () => {
  it('formats feet and inches', () => {
    expect(formatLength(144, 'ft-in')).toBe(`12'-0"`);
    expect(formatLength(150.5, 'ft-in')).toBe(`12'-6.5"`);
    expect(formatLength(48, 'ft-decimal')).toBe('4.00 ft');
    expect(formatLength(39.3700787, 'metric')).toBe('1.00 m');
    expect(formatArea(192 * 144, 'ft-in')).toBe('192.0 sq ft');
  });
  it('parses many length notations into inches', () => {
    expect(parseLength(`12'6"`)).toBe(150);
    expect(parseLength(`12' 6"`)).toBe(150);
    expect(parseLength('12ft 6in')).toBe(150);
    expect(parseLength('4')).toBe(48);
    expect(parseLength('4', 'metric')).toBeCloseTo(157.48, 1);
    expect(parseLength('48"')).toBe(48);
    expect(parseLength('48in')).toBe(48);
    expect(parseLength('2.5ft')).toBe(30);
    expect(parseLength('100cm')).toBeCloseTo(39.37, 2);
    expect(parseLength('abc')).toBeNull();
  });
});
