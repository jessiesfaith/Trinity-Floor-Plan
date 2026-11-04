import { describe, expect, it } from 'vitest';
import { generateLayouts, syntheticRoom } from '@/lib/generator';
import { createSampleProject, DEFAULT_SETTINGS } from '@/lib/sampleProject';
import { validate } from '@/lib/validation';
import type { Room } from '@/types/plan';

const run = (width: number, length: number, employees: number, doorSide: 'top' | 'left' = 'top', doorOffset = 54, minAisle = 48) => {
  const { room, context } = syntheticRoom({ width, length, shape: 'rectangle', doorSide, doorOffset, doorWidth: 36 });
  return generateLayouts({
    room, context, employees, cubicleWidth: 48, cubicleDepth: 48, minAisle,
    orientation: 'auto', arrangement: 'auto', settings: DEFAULT_SETTINGS,
  });
};

describe('layout generator', () => {
  it('returns the four option types', () => {
    const opts = run(144, 192, 8);
    expect(opts.map((o) => o.key)).toEqual(['comfort', 'balanced', 'density', 'shared']);
  });

  it('never returns a layout with blocking conflicts', () => {
    for (const o of run(144, 192, 8)) {
      expect(o.metrics.clearanceConflicts).toBe(0);
      expect(o.metrics.doorObstructions).toBe(0);
    }
  });

  it('respects the requested headcount cap for comfort/balanced', () => {
    const opts = run(144, 192, 6);
    expect(opts.find((o) => o.key === 'balanced')!.metrics.seats).toBeLessThanOrEqual(6);
  });

  it('capacity comes from geometry: a 14x12 room cannot hold eight 4x4 cubicles with a 48" aisle', () => {
    // 168" x 144": rows of 3 across, row|aisle|row = 144" deep => at most 6.
    const density = run(168, 144, 8, 'top', 60).find((o) => o.key === 'density')!;
    expect(density.metrics.workstations).toBeLessThan(8);
    expect(density.metrics.workstations).toBeGreaterThan(0);
  });

  it('smaller aisle setting never reduces maximum density', () => {
    const wide = run(168, 144, 99, 'top', 60, 48).find((o) => o.key === 'density')!;
    const narrow = run(168, 144, 99, 'top', 60, 36).find((o) => o.key === 'density')!;
    expect(narrow.metrics.workstations).toBeGreaterThanOrEqual(wide.metrics.workstations);
  });

  it('sample project scenarios validate without blocking errors in the cubicle areas', () => {
    const p = createSampleProject();
    expect(p.scenarios).toHaveLength(5);
    for (const s of p.scenarios) {
      const v = validate(s.objects, p.settings);
      const errs = v.issues.filter((i) => i.severity === 'error');
      expect(errs.map((e) => e.message)).toEqual([]);
    }
    const areas = p.scenarios[1].objects.filter((o): o is Room => o.kind === 'room' && o.roomType === 'cubicle-area');
    expect(areas).toHaveLength(2);
  });
});
