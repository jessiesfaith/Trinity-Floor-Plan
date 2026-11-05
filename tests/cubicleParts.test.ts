import { describe, expect, it } from 'vitest';
import { createSampleProject } from '@/lib/sampleProject';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import { furnitureFromTemplate } from '@/lib/objects';
import { cubicleWallRuns, explodeCubicles, panelsFor } from '@/lib/cubicleParts';
import type { Furniture, PlanObject, Wall } from '@/types/plan';

const cub = (w: number, d: number) => BUILT_IN_TEMPLATES.find((t) => t.type === 'cubicle' && t.width === w && t.depth === d) ?? { ...BUILT_IN_TEMPLATES.find((t) => t.id === 'cub-4x4')!, width: w, depth: d };
const place = (w: number, d: number, x: number, y: number, rotation: number, name: string): Furniture => furnitureFromTemplate(cub(w, d), x, y, name, rotation);
const key = (item: string) => `Cubicles|${item}`;

describe('cubicle parts', () => {
  it('splits runs into 4 ft walls with a 2 ft wall at the end', () => {
    expect(panelsFor(144)).toEqual([48, 48, 48]);
    expect(panelsFor(72)).toEqual([48, 24]);
    expect(panelsFor(48)).toEqual([48]);
  });

  it('lays a shared wall once and none along a building wall', () => {
    // two 4x4 cubicles side by side, backs against a building wall at y = -24
    const a = place(48, 48, 24, 0, 0, 'A');
    const b = place(48, 48, 72, 0, 0, 'B');
    const wall: Wall = { id: 'w', kind: 'wall', name: 'Wall', a: { x: -100, y: -28 }, b: { x: 300, y: -28 }, thickness: 8, color: '#000', wallType: 'interior', locked: false, notes: '' } as Wall;
    const runs = cubicleWallRuns([a, b], [wall]);
    const total = runs.reduce((n, s) => n + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0);
    expect(total).toBeCloseTo(48 * 3, 0); // left, shared middle, right; no back
    expect(cubicleWallRuns([a, b], []).reduce((n, s) => n + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), 0)).toBeCloseTo(48 * 5, 0);
  });

  it('replaces cubicles with walls and desks, following the stock on hand', () => {
    const p = createSampleProject();
    const objs: PlanObject[] = [...p.scenarios[0].objects, place(48, 48, 300, 120, 0, 'C1'), place(48, 72, 360, 120, 0, 'C2'), place(72, 48, 300, 240, 0, 'C3')];
    const { objects, used, cubicles } = explodeCubicles(objs, p.inventory);
    expect(cubicles).toBe(3);
    expect(objects.some((o) => o.kind === 'furniture' && o.type === 'cubicle')).toBe(false);
    expect(used.get(key('Corner desks'))).toBe(3);
    expect(used.get(key('Short desks'))).toBe(2); // the 6 ft sides
    expect(used.get(key('Hanging shelves (in cubicles)'))).toBe(3);
    expect(used.get(key('Long cubicle walls'))).toBeGreaterThan(0);
  });

  it('can lay the cubicle walls only, with no furniture', () => {
    const p = createSampleProject();
    const { objects, used } = explodeCubicles([place(48, 72, 0, 0, 0, 'C'), place(72, 48, 200, 0, 0, 'D')], p.inventory, { furniture: false });
    expect([...used.keys()].every((k) => k.includes('cubicle walls'))).toBe(true);
    expect(objects.every((o) => o.kind === 'furniture' && o.type === 'partition')).toBe(true);
  });

  it('uses two long desks once the corner desks run out', () => {
    const p = createSampleProject();
    const inv = p.inventory!.map((x) => (x.item === 'Corner desks' ? { ...x, qty: 0 } : x));
    const { used } = explodeCubicles([place(48, 72, 0, 0, 0, 'C'), place(72, 48, 200, 0, 0, 'D')], inv);
    expect(used.get(key('Long desks'))).toBe(4);
    expect(used.get(key('Short desks')) ?? 0).toBe(0);
  });
});

// The office's Layout 1 as saved on Nov 5, 2026 (cubicles only), on the current floor plan.
describe("the office's current layout", () => {
  it('fits the inventory once building walls stand in for cubicle walls', () => {
    const rows: [string, number, number, number, number, number][] = [
      ['Cubicle 03', 72, 48, 90, 240, 6], ['Cubicle 04', 48, 72, 0, 288, 6], ['Cubicle 05', 72, 48, 90, 383, 6], ['Cubicle 09', 48, 72, 180, 384.5, 78],
      ['Cubicle 10', 48, 48, 90, 126, 209.5], ['Cubicle 11', 48, 72, 180, 126, 270], ['Cubicle 12', 48, 72, 180, 126, 341.6], ['Cubicle 14', 72, 48, -90, 30, 270],
      ['Cubicle 15', 72, 48, -90, 30, 342.5], ['Cubicle 11b', 72, 48, -90, 289.4, 77], ['Cubicle 12b', 48, 72, 180, 240.5, 78.8], ['Cubicle 15b', 48, 48, 0, 30, 210],
    ];
    const p = createSampleProject();
    const objs = [...p.scenarios[0].objects, ...rows.map(([n, w, d, r, x, y]) => place(w, d, x, y, r, n))];
    const { used } = explodeCubicles(objs, p.inventory);
    const all = explodeCubicles(objs.filter((o) => o.kind !== 'wall'), p.inventory).used;
    expect(used.get(key('Long cubicle walls'))).toBe(23);
    expect(used.get(key('Short cubicle walls'))).toBe(5);
    expect(used.get(key('Corner desks'))).toBe(8);
    expect(used.get(key('Long desks'))).toBe(8);
    expect(used.get(key('Short desks'))).toBe(6);
    // Without the building walls every side would need its own cubicle wall.
    expect(all.get(key('Long cubicle walls'))).toBe(38);
  });
});
