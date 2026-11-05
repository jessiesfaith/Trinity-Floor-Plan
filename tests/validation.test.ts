import { describe, expect, it } from 'vitest';
import { validate } from '@/lib/validation';
import { createSampleProject, DEFAULT_SETTINGS } from '@/lib/sampleProject';
import { furnitureFromTemplate, makeAisle, makeDimension, makeDoor, makeRoom, makeWall, roomAt } from '@/lib/objects';
import { BUILT_IN_TEMPLATES } from '@/lib/library';
import type { Furniture, PlanObject, Room } from '@/types/plan';

const cub = BUILT_IN_TEMPLATES.find((t) => t.id === 'cub-4x4')!;
const S = DEFAULT_SETTINGS;
const box = (w: number, h: number) => makeRoom('Box', 'cubicle-area', [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);

describe('validation', () => {
  it('flags overlapping furniture', () => {
    const r = box(400, 400);
    const a = furnitureFromTemplate(cub, 100, 100);
    const b = furnitureFromTemplate(cub, 130, 100);
    const v = validate([r, a, b], S);
    expect(v.issues.some((i) => i.code === 'overlap')).toBe(true);
    expect(v.conflictIds.has(a.id)).toBe(true);
  });

  it('changing a cubicle from 4 ft to 5 ft wide updates its real footprint and re-validates', () => {
    const r = box(400, 400);
    const a = furnitureFromTemplate(cub, 100, 100);
    const b = furnitureFromTemplate(cub, 148, 100); // exactly touching at 4 ft
    expect(validate([r, a, b], S).issues.filter((i) => i.code === 'overlap')).toHaveLength(0);
    const wider: Furniture = { ...a, width: 60 };
    const v = validate([r, wider, b], S);
    expect(v.issues.some((i) => i.code === 'overlap')).toBe(true);
  });

  it('moving a cubicle into an aisle produces a clearance warning', () => {
    const r = box(144, 192);
    const front = furnitureFromTemplate(cub, 24, 96, 'Front', 270); // opening faces +x
    expect(validate([r, front], S).issues.filter((i) => i.code === 'access')).toHaveLength(0);
    // Facing cubicle pushed 24" into the 48" aisle.
    const facing = furnitureFromTemplate(cub, 96, 96, 'Facing', 90);
    const v = validate([r, front, facing], S);
    expect(v.issues.some((i) => i.code === 'access' && i.objectIds.includes(front.id))).toBe(true);
    // An explicit aisle zone is also protected.
    const aisle = makeAisle(72, 96, 192, 48, 90);
    const blocked = furnitureFromTemplate(cub, 72, 96);
    expect(validate([r, aisle, blocked], S).issues.some((i) => i.code === 'aisle-blocked')).toBe(true);
  });

  it('detects wall intersections, door swing obstructions and room-boundary crossings', () => {
    const r = box(200, 200);
    const wall = makeWall({ x: 100, y: 0 }, { x: 100, y: 200 });
    const door = makeDoor(0, 100, 0, 36, 1);
    const a = furnitureFromTemplate(cub, 100, 50);
    const b = furnitureFromTemplate(cub, 20, 120);
    const c = furnitureFromTemplate(cub, 190, 180);
    const v = validate([r, wall, door, a, b, c], S);
    const codes = v.issues.map((i) => i.code);
    expect(codes).toContain('wall');
    expect(codes).toContain('door-swing');
    expect(codes).toContain('out-of-room');
  });

  it('reports circulation: a workstation boxed in has no path to the door', () => {
    const r = box(144, 144);
    const ws = [
      makeWall({ x: 72, y: -3 }, { x: 144, y: -3 }),
      makeWall({ x: -3, y: 0 }, { x: -3, y: 144 }),
      makeWall({ x: 147, y: 0 }, { x: 147, y: 144 }),
      makeWall({ x: 0, y: 147 }, { x: 144, y: 147 }),
      makeWall({ x: 0, y: -3 }, { x: 36, y: -3 }), // door gap 36..72 on top
    ];
    const target = furnitureFromTemplate(cub, 120, 120, 'Corner', 0);
    target.access = 'front-chair';
    const blockers = [
      { ...furnitureFromTemplate(cub, 72, 120), access: 'none' as const, isWorkstation: false },
      { ...furnitureFromTemplate(cub, 120, 72), access: 'none' as const, isWorkstation: false },
      { ...furnitureFromTemplate(cub, 72, 72), access: 'none' as const, isWorkstation: false },
    ];
    const v = validate([r, ...ws, target, ...blockers] as PlanObject[], { ...S, chairClearance: 0 });
    expect(v.issues.some((i) => i.code === 'no-path' && i.objectIds.includes(target.id))).toBe(true);
  });

  it('label-only dimension overrides are flagged so the drawing cannot silently mislead', () => {
    const d = { ...makeDimension({ x: 0, y: 0 }, { x: 144, y: 0 }), labelOverride: "16'-0\"" };
    expect(validate([d], S).issues.some((i) => i.code === 'label-override')).toBe(true);
  });

  it('always carries the professional-review notice and flags uncalibrated backgrounds', () => {
    const v = validate([], S, { background: { calibrated: false } as never });
    expect(v.issues.some((i) => i.code === 'review')).toBe(true);
    expect(v.issues.some((i) => i.code === 'uncalibrated')).toBe(true);
  });

  it('roomAt picks the smallest containing room', () => {
    const big = box(500, 500);
    const small = { ...box(100, 100), id: 'small' } as Room;
    expect(roomAt([big, small], { x: 50, y: 50 })?.id).toBe('small');
  });

  it('sample cubicle areas match the planning inputs (12x16 and 12x22 clear)', () => {
    const p = createSampleProject();
    const rooms = p.scenarios[0].objects.filter((o): o is Room => o.kind === 'room' && o.roomType === 'cubicle-area');
    const areas = rooms.map((r) => Math.round(Math.abs(r.points.reduce((a, q, i) => a + (q.x * r.points[(i + 1) % 4].y - r.points[(i + 1) % 4].x * q.y), 0) / 2) / 144));
    expect(areas.sort()).toEqual([235, 264]);
  });
});
