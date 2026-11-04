import { describe, expect, it } from 'vitest';
import { createSampleProject, withGenerated } from '@/lib/sampleProject';
import { validate } from '@/lib/validation';
import { roomArea } from '@/lib/objects';
import { bbox } from '@/lib/geometry';
import type { Room } from '@/types/plan';

const p = createSampleProject();
const objs = p.scenarios[0].objects;
const room = (name: string) => objs.find((o): o is Room => o.kind === 'room' && o.name === name)!;

describe('traced Trinity plan (Floor_Plan.pdf)', () => {
  it('has the conference room and Offices 1–4, all contractor-fixed and locked', () => {
    for (const n of ['Conference Room', 'Office 1', 'Office 2', 'Office 3', 'Office 4']) {
      const r = room(n);
      expect(r, n).toBeTruthy();
      expect(r.fixed).toBe('Contractor-fixed');
      expect(r.locked).toBe(true);
    }
    const fixedWalls = objs.filter((o) => o.kind === 'wall' && o.fixed);
    expect(fixedWalls.length).toBeGreaterThan(5);
    expect(fixedWalls.every((w) => w.locked)).toBe(true);
  });

  it('conference room is 24 x 14 ft clear, as marked', () => {
    const b = bbox(room('Conference Room').points);
    expect(b.width / 12).toBeCloseTo(24, 2);
    expect(b.height / 12).toBeCloseTo(14, 2);
  });

  it('Office 1 is a 15 x 15 ft clear right triangle with its long side on the 45-degree wall', () => {
    const pts = room('Office 1').points.map((q) => ({ x: q.x / 12, y: q.y / 12 }));
    expect(pts).toHaveLength(3);
    const len = (i: number) => Math.hypot(pts[(i + 1) % 3].x - pts[i].x, pts[(i + 1) % 3].y - pts[i].y);
    const sides = [0, 1, 2].map(len).sort((a, b) => a - b);
    expect(sides[0]).toBeCloseTo(15, 2);
    expect(sides[1]).toBeCloseTo(15, 2);
    expect(sides[2]).toBeCloseTo(Math.hypot(15, 15), 2); // right angle between the two 15 ft sides
  });

  it('cubicle areas match the marked 12 x 16 and 12 x 14 dimensions', () => {
    expect(roomArea(room('Cubicle Area A')) / 144).toBeCloseTo(192, 1);
    expect(roomArea(room('Cubicle Area B')) / 144).toBeCloseTo(168, 1);
  });

  it('starter layouts are the plan as drawn: no generated workstations, no conflicts', () => {
    for (const s of p.scenarios) {
      expect(s.objects.some((o) => o.kind === 'furniture' && o.isWorkstation)).toBe(false);
      expect(validate(s.objects, p.settings).errorCount).toBe(0);
    }
  });

  it('generator works against the traced walls and doors (regression: exact-fit rounding)', () => {
    const g = withGenerated(objs, 'density', 99);
    const v = validate(g, p.settings);
    expect(v.errorCount).toBe(0);
    const ws = g.filter((o) => o.kind === 'furniture' && o.isWorkstation);
    expect(ws.filter((o) => o.name.startsWith('Cubicle A')).length).toBe(8);
    expect(ws.filter((o) => o.name.startsWith('Cubicle B')).length).toBeGreaterThan(0);
  });
});
