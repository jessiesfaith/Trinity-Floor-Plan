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

  it('Office 1 is a clear right triangle with its door wall (13 ft measured + 3 ft pushed out) running straight up to the main entry', () => {
    const r = room('Office 1');
    const pts = r.points.map((q) => ({ x: q.x / 12, y: q.y / 12 }));
    expect(pts).toHaveLength(3);
    const b = bbox(pts);
    expect(b.height).toBeCloseTo(16, 2); // door wall (runs across the suite)
    expect(pts.some((q) => Math.abs(q.x - b.minX) < 1e-6 && Math.abs(q.y - b.maxY) < 1e-6)).toBe(true); // right angle
    expect(objs.some((o) => o.kind === 'door' && o.name === 'Office 1 door')).toBe(true);
  });

  it('matches the on-site measurements along the window wall, left wall and top wall', () => {
    const w = (n: string) => bbox(room(n).points).width / 12;
    const h = (n: string) => bbox(room(n).points).height / 12;
    expect(w('Area B')).toBeCloseTo(12, 2);
    expect(w('Office 4')).toBeCloseTo(12, 2);
    expect(w('Office 3')).toBeCloseTo(12, 2);
    expect(h('Office 4')).toBeCloseTo(12, 2);
    expect(h('Office 3')).toBeCloseTo(12, 2);
    // Office 2: 17 ft along the window wall (its bottom edge).
    const o2 = room('Office 2').points.map((q) => ({ x: q.x / 12, y: q.y / 12 }));
    const bottom = Math.max(...o2.map((q) => q.y));
    const onWindow = o2.filter((q) => Math.abs(q.y - bottom) < 1e-6).map((q) => q.x);
    expect(Math.max(...onWindow) - Math.min(...onWindow)).toBeCloseTo(17, 2);
    // Kitchen: 10'-3" wide, 11'-8" deep along the left wall.
    expect(w('Kitchen')).toBeCloseTo(10.25, 2);
    expect(h('Kitchen')).toBeCloseTo(11 + 8 / 12, 2);
    // IT / Storage: 8'-6" along the top wall x 12' deep.
    expect(w('IT / Storage')).toBeCloseTo(8.5, 2);
    expect(h('IT / Storage')).toBeCloseTo(12, 2);
  });

  it('cubicle areas match the marked 12 x 16 and 12 x 22 dimensions', () => {
    expect(roomArea(room('Area A')) / 144).toBeCloseTo(16 * (14 + 8 / 12), 1); // 16' x 14'-8", walkway to the top wall
    expect(roomArea(room('Area B')) / 144).toBeCloseTo(264, 1);
  });

  it('has a 5 ft walkway from the conference room to Area A, and a walled kitchenette with a door', () => {
    const conf = bbox(room('Conference Room').points);
    const a = bbox(room('Area A').points);
    const confTopFace = conf.minY - 5; // the conference room's clear top edge, minus its 5" wall
    expect((confTopFace - a.maxY) / 12).toBeCloseTo(5, 2);
    const walk = objs.find((o) => o.kind === 'aisle' && o.name === "Walkway (5')");
    expect(walk && walk.kind === 'aisle' && walk.depth / 12).toBeCloseTo(5, 2);
    // Area B runs up to the kitchenette wall: its top edge is the wall's 5" away from the kitchen floor.
    const b = bbox(room('Area B').points);
    const k = bbox(room('Kitchen').points);
    expect((b.minY - k.maxY) / 12).toBeCloseTo(5 / 12, 2);
    expect(objs.some((o) => o.kind === 'door' && o.name === 'Kitchen door')).toBe(true);
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
