// Numbered names for cubicles ("Cubicle 07") and phone booths ("Phone booth 3"): every one in a
// layout gets its own number. New ones take the number after the highest in use (counting them
// went wrong after a delete), copies get a new number instead of "copy", and plans saved with
// repeated numbers are put right when they load.

import type { Furniture, PlanObject, Scenario } from '@/types/plan';

const SERIES = {
  cubicle: { prefix: 'Cubicle', pad: 2 },
  'phone-booth': { prefix: 'Phone booth', pad: 0 },
} as const;
type Numbered = keyof typeof SERIES;

const isNumberedType = (t: string): t is Numbered => t in SERIES;

/** The number in a name like "Cubicle 11" or "Cubicle 11 copy"; null for any other name. */
export function numberOf(type: string, name: string): number | null {
  if (!isNumberedType(type)) return null;
  const m = new RegExp(`^${SERIES[type].prefix} ([0-9]+)(?: copy)*$`, 'i').exec(name.trim());
  return m ? Number(m[1]) : null;
}

export function numberedName(type: Numbered, n: number): string {
  const s = SERIES[type];
  return `${s.prefix} ${String(n).padStart(s.pad, '0')}`;
}

const highest = (objs: PlanObject[], type: string) =>
  objs.reduce((m, o) => (o.kind === 'furniture' && o.type === type ? Math.max(m, numberOf(type, o.name) ?? 0) : m), 0);

/** Name for a new piece of this type in a layout: the next free number for cubicles and phone booths. */
export function nameForNew(objs: PlanObject[], type: string, fallback: string): string {
  return isNumberedType(type) ? numberedName(type, highest(objs, type) + 1) : fallback;
}

/** Give copied cubicles / phone booths their own numbers (after the highest in `existing`). */
export function numberCopies<T extends PlanObject>(existing: PlanObject[], copies: T[]): T[] {
  const next = new Map<string, number>();
  return copies.map((c) => {
    if (c.kind !== 'furniture' || !isNumberedType(c.type) || numberOf(c.type, c.name) == null) return c;
    const n = (next.get(c.type) ?? highest(existing, c.type)) + 1;
    next.set(c.type, n);
    return { ...c, name: numberedName(c.type, n) } as T;
  });
}

/** Renumber cubicles / phone booths whose number repeats an earlier one (or that are "copy"s). */
export function renumberDuplicates(s: Scenario): Scenario {
  const seen = new Map<string, Set<number>>();
  const next = new Map<string, number>();
  let changed = false;
  const objects = s.objects.map((o) => {
    if (o.kind !== 'furniture' || !isNumberedType(o.type)) return o;
    const n = numberOf(o.type, o.name);
    if (n == null) return o;
    const used = seen.get(o.type) ?? new Set<number>();
    seen.set(o.type, used);
    const isCopy = /copy$/i.test(o.name.trim());
    if (!used.has(n) && !isCopy) {
      used.add(n);
      return o;
    }
    const m = (next.get(o.type) ?? highest(s.objects, o.type)) + 1;
    next.set(o.type, m);
    used.add(m);
    changed = true;
    return { ...o, name: numberedName(o.type, m) } as Furniture;
  });
  return changed ? { ...s, objects } : s;
}
