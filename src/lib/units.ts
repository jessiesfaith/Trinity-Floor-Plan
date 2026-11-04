// Display-unit conversion. The model stores inches; these helpers format and parse.

import type { DisplayUnits } from '@/types/plan';

export const IN_PER_FT = 12;
export const IN_PER_M = 39.3700787;
export const SQIN_PER_SQFT = 144;

export function formatLength(inches: number, units: DisplayUnits, precision = 1): string {
  if (!Number.isFinite(inches)) return '—';
  if (units === 'metric') {
    const m = inches / IN_PER_M;
    return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(2)} m`;
  }
  if (units === 'ft-decimal') return `${(inches / IN_PER_FT).toFixed(precision + 1)} ft`;
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  // Round to nearest 1/4 inch.
  const totalQuarter = Math.round(abs * 4);
  let ft = Math.floor(totalQuarter / (IN_PER_FT * 4));
  let rem = (totalQuarter - ft * IN_PER_FT * 4) / 4;
  if (rem >= 12) {
    ft += 1;
    rem -= 12;
  }
  const inchStr = Number.isInteger(rem) ? `${rem}` : rem.toFixed(2).replace(/0+$/, '');
  return `${sign}${ft}'-${inchStr}"`;
}

export function formatArea(sqInches: number, units: DisplayUnits): string {
  if (units === 'metric') return `${(sqInches / (IN_PER_M * IN_PER_M)).toFixed(1)} m²`;
  return `${(sqInches / SQIN_PER_SQFT).toFixed(1)} sq ft`;
}

export const sqft = (sqInches: number) => sqInches / SQIN_PER_SQFT;

/**
 * Parse a user-entered length into inches. Accepts:
 *   12'6"  12' 6"  12ft 6in  12.5ft  12.5'  150"  150in  3.2m  320cm  "12.5" (bare = default unit)
 * Returns null when unparseable.
 */
export function parseLength(input: string, defaultUnits: DisplayUnits = 'ft-in'): number | null {
  const s = input.trim().toLowerCase().replace(/[’′]/g, "'").replace(/[”″]/g, '"');
  if (!s) return null;
  const num = '(-?\\d+(?:\\.\\d+)?)';
  let m: RegExpMatchArray | null;
  if ((m = s.match(new RegExp(`^${num}\\s*(?:'|ft|feet|foot)\\s*-?\\s*(?:${num}\\s*(?:"|in|inch|inches)?)?$`)))) {
    const ft = parseFloat(m[1]);
    const inch = m[2] ? parseFloat(m[2]) : 0;
    return ft * IN_PER_FT + Math.sign(ft || 1) * inch;
  }
  if ((m = s.match(new RegExp(`^${num}\\s*(?:"|in|inch|inches)$`)))) return parseFloat(m[1]);
  if ((m = s.match(new RegExp(`^${num}\\s*cm$`)))) return (parseFloat(m[1]) / 100) * IN_PER_M;
  if ((m = s.match(new RegExp(`^${num}\\s*mm$`)))) return (parseFloat(m[1]) / 1000) * IN_PER_M;
  if ((m = s.match(new RegExp(`^${num}\\s*m$`)))) return parseFloat(m[1]) * IN_PER_M;
  if ((m = s.match(new RegExp(`^${num}$`)))) {
    const v = parseFloat(m[1]);
    return defaultUnits === 'metric' ? v * IN_PER_M : v * IN_PER_FT;
  }
  return null;
}

/** Value shown inside numeric inputs (no unit suffix), in the user's unit. */
export function toInputValue(inches: number, units: DisplayUnits): string {
  if (units === 'metric') return (inches / IN_PER_M).toFixed(3).replace(/\.?0+$/, '');
  if (units === 'ft-decimal') return (inches / IN_PER_FT).toFixed(3).replace(/\.?0+$/, '');
  return formatLength(inches, 'ft-in');
}
