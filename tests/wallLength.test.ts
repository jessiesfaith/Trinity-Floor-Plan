import { describe, expect, it } from 'vitest';
import { wallInsideLength, wallRuns } from '@/lib/wallLength';
import { makeWall } from '@/lib/objects';
import { createSampleProject } from '@/lib/sampleProject';
import type { Wall } from '@/types/plan';

const w = (ax: number, ay: number, bx: number, by: number, thickness: number): Wall => ({ ...makeWall({ x: ax, y: ay }, { x: bx, y: by }, 'interior'), thickness });

describe('wall inside length', () => {
  it('subtracts half of each wall it meets at a right angle', () => {
    const left = w(0, 0, 0, 240, 8);
    const top = w(0, 0, 120, 0, 8);
    const bottom = w(0, 240, 120, 240, 5);
    expect(wallInsideLength(left, [left, top, bottom])).toBeCloseTo(240 - 4 - 2.5, 6);
  });
  it('leaves free ends and straight continuations alone', () => {
    const a = w(0, 0, 0, 100, 8);
    const b = w(0, 100, 0, 200, 8);
    expect(wallInsideLength(a, [a, b])).toBeCloseTo(100, 6);
  });
  it('uses half thickness / sin(angle) at a 45° joint', () => {
    const a = w(0, 0, 100, 0, 5);
    const diag = w(50, 50, 150, -50, 8); // 45° wall through a's end
    expect(wallInsideLength(a, [a, diag])).toBeCloseTo(100 - 4 / Math.SQRT1_2, 6);
  });
  it("reads 22'-0\" for the wall beside Area B", () => {
    const walls = createSampleProject().scenarios[0].objects.filter((o): o is Wall => o.kind === 'wall');
    const left = walls.filter((x) => Math.abs(x.a.x) < 1 && Math.abs(x.b.x) < 1);
    const lengths = left.map((x) => wallInsideLength(x, walls) / 12);
    expect(lengths.some((l) => Math.abs(l - 22) < 0.01)).toBe(true);
  });
});

describe('wall runs (corner to corner, across door openings)', () => {
  const objs = createSampleProject().scenarios[0].objects;
  const walls = objs.filter((o): o is Wall => o.kind === 'wall');
  const runs = wallRuns(walls);
  const runOf = (name: string) => {
    const room = objs.find((o) => o.kind === 'room' && o.name === name)!;
    const ys = room.kind === 'room' ? room.points.map((p) => p.y) : [];
    const xs = room.kind === 'room' ? room.points.map((p) => p.x) : [];
    const top = Math.min(...ys);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    // the run along the room's top edge (offices) whose span covers the room's middle
    return runs.find((r) => Math.abs(r.a.y - r.b.y) < 0.5 && Math.abs(r.a.y - top) < 6 && Math.min(r.a.x, r.b.x) < cx && Math.max(r.a.x, r.b.x) > cx)!;
  };
  it("labels Offices 3 and 4's door walls 12'-0\" and the conference room's 24'-0\"", () => {
    expect(runOf('Office 4').inside / 12).toBeCloseTo(12, 2);
    expect(runOf('Office 3').inside / 12).toBeCloseTo(12, 2);
    expect(runOf('Office 4').ids.length).toBe(2); // the two pieces either side of the door
    const conf = objs.find((o) => o.kind === 'room' && o.name === 'Conference Room')!;
    const confTop = conf.kind === 'room' ? Math.min(...conf.points.map((p) => p.y)) : 0;
    const confRun = runs.find((r) => Math.abs(r.a.y - r.b.y) < 0.5 && Math.abs(r.a.y - confTop) < 6 && r.ids.length === 3)!;
    expect(confRun.inside / 12).toBeCloseTo(24, 2);
  });
});
